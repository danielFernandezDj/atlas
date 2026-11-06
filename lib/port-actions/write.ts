/**
 * Applies map port actions in serializable transactions after checking staff and
 * expected port snapshots. It reuses inventory-actions/write.ts for miner moves so
 * reservation changes, movement history and audit receipts commit together.
 *
 * Navigation: authorization and receipt replay; location/port locks; expected snapshot checks; operation branches; audit and retries.
 */
import "server-only"
import type { PrismaClient, Prisma } from "@/lib/generated/prisma/client"
import {
  ActionError,
  canWriteInventory,
} from "@/lib/inventory-actions/contracts"
import { activeLocation, locationSelect } from "@/lib/inventory-actions/read"
import {
  applyInventoryAction,
  placementKey,
} from "@/lib/inventory-actions/write"
import { readPortDetail } from "./read"
import { samePortSnapshot, type PortCommand, type PortMiner } from "./contracts"
export type PortResult = {
  locationId: number
  portId: number
  minerIds: number[]
  message: string
}
export async function performPortAction(
  db: Pick<PrismaClient, "$transaction">,
  actorId: number,
  input: PortCommand
): Promise<PortResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM users WHERE id=${actorId} FOR SHARE`
          const actor = await tx.users.findUnique({
            where: { id: actorId },
            select: { is_active: true, role: true },
          })
          if (!actor?.is_active || !canWriteInventory(actor.role))
            throw new ActionError(403, "Your account cannot change inventory.")
          const { submissionKey, ...payload } = input,
            fingerprint = JSON.stringify(payload)
          // Receipt replay precedes snapshot validation so an accepted command can be retried safely.
          const prior = await tx.audit_log.findFirst({
            where: {
              details: { path: ["submissionKey"], equals: submissionKey },
            },
            select: { user_id: true, details: true },
          })
          if (prior) {
            const d = prior.details as {
              fingerprint?: string
              result?: PortResult
            }
            if (
              prior.user_id !== actorId ||
              d.fingerprint !== fingerprint ||
              d.result?.locationId !== input.locationId
            )
              throw new ActionError(
                409,
                "This submission key was already used for another change."
              )
            return d.result
          }
          await tx.$queryRaw`SELECT id FROM port_index WHERE location_id=${input.locationId} FOR UPDATE`
          await tx.$queryRaw`SELECT id FROM locations WHERE id=${input.locationId} FOR UPDATE`
          const initial = await readPortDetail(tx, input.locationId)
          const lockIds = [
            ...new Set(
              [
                initial.occupant?.id,
                initial.reservation?.id,
                input.incoming?.id,
              ].filter((id): id is number => id !== undefined)
            ),
          ].sort((a, b) => a - b)
          for (const id of lockIds)
            await tx.$queryRaw`SELECT id FROM miners WHERE id=${id} FOR UPDATE`
          const port = await readPortDetail(tx, input.locationId),
            op = input.operation
          if (!samePortSnapshot(port.snapshot, input.snapshot))
            throw new ActionError(
              409,
              "This port or its miner changed. Reload the port before saving."
            )
          if (port.conflict)
            throw new ActionError(
              409,
              "This location has conflicting assignments. Reconcile its inventory before using port actions."
            )
          if (
            op !== "disable" &&
            op !== "release" &&
            op !== "pull" &&
            (!port.hierarchyActive || !port.switchActive)
          )
            throw new ActionError(
              409,
              "The location, site, building, can or network switch is inactive."
            )
          if (
            op !== "enable" &&
            op !== "disable" &&
            op !== "release" &&
            op !== "pull" &&
            !port.portActive
          )
            throw new ActionError(
              409,
              "Re-enable this port before assigning or pulling miners."
            )
          if (op === "disable" && !port.portActive)
            throw new ActionError(409, "This port is already disabled.")
          if (op === "enable" && port.portActive)
            throw new ActionError(409, "This port is already enabled.")
          if (op === "add" && (port.occupant || port.reservation))
            throw new ActionError(
              409,
              "This location is occupied or reserved. Use Replace miner."
            )
          if (op === "replace" && !port.occupant && !port.reservation)
            throw new ActionError(
              409,
              "This port is empty. Use Add miner here."
            )
          if (op === "pull" && !port.occupant)
            throw new ActionError(
              409,
              "No miner is physically assigned to this port."
            )
          if (
            (op === "release" || op === "return") &&
            (!port.reservation || port.occupant)
          )
            throw new ActionError(
              409,
              "This action requires a reservation without a miner at the port."
            )
          if (
            op === "replace" &&
            (input.incoming?.id === port.occupant?.id ||
              input.incoming?.id === port.reservation?.id)
          )
            throw new ActionError(
              400,
              "Choose a different incoming miner, or use Return reserved miner."
            )
          if (
            input.keepReservation &&
            (!port.portActive || !port.hierarchyActive || !port.switchActive)
          )
            throw new ActionError(
              409,
              "A disabled or inactive port cannot keep a repair reservation."
            )
          let destination: Awaited<
            ReturnType<
              typeof tx.locations.findUnique<{
                where: { id: number }
                select: typeof locationSelect
              }>
            >
          > | null = null
          const relocates =
            op === "pull" || (op === "replace" && !!port.occupant)
          if (relocates && input.disposition !== "UNASSIGNED") {
            if (!input.destinationId)
              throw new ActionError(
                400,
                "Choose the outgoing miner’s destination."
              )
            destination = await tx.locations.findUnique({
              where: { id: input.destinationId },
              select: locationSelect,
            })
            if (
              !destination ||
              !activeLocation(destination) ||
              destination.kind !== input.disposition
            )
              throw new ActionError(
                400,
                "Choose an active repair, staging or pallet location matching the selected reason."
              )
          }
          await tx.$queryRaw`SELECT set_config('atlas.actor_id',${String(actorId)},true),set_config('atlas.source','MANUAL',true)`
          const affected = new Set<number>()
          const incoming =
            op === "return"
              ? { id: port.reservation!.id, version: port.reservation!.version }
              : input.incoming
          const clearReservation = op !== "enable"
          if (clearReservation)
            await tx.port_index.update({
              where: { id: port.portId },
              data: {
                reserved_miner_id: null,
                ...(op === "disable" ? { active: false } : {}),
              },
            })
          if (op === "enable")
            await tx.port_index.update({
              where: { id: port.portId },
              data: { active: true },
            })
          async function changeMiner(m: PortMiner, unassign: boolean) {
            const target = unassign ? null : (destination?.id ?? null)
            const moved = unassign
              ? m.locationId === port.locationId ||
                m.occupiedSlotId === port.locationId
              : true
            const data: Prisma.minerUpdateManyMutationInput = {
              version: { increment: 1 },
              ...(moved
                ? { current_location_id: target, occupied_slot_id: null }
                : {}),
            }
            const updated = await tx.miner.updateMany({
              where: { id: m.id, version: m.version },
              data,
            })
            if (updated.count !== 1)
              throw new ActionError(
                409,
                "This miner changed. Reload before saving."
              )
            affected.add(m.id)
            if (moved && target !== null && target !== m.locationId)
              await tx.miner_movements.create({
                data: {
                  miner_id: m.id,
                  recorded_by_id: actorId,
                  source: "MANUAL",
                  from_location_id: m.locationId,
                  to_location_id: target,
                  reason:
                    input.disposition === "REPAIR" ? "REPAIR" : "RELOCATION",
                  notes: input.notes,
                  submission_key: placementKey(submissionKey, 1),
                },
              })
            await tx.miner_history.create({
              data: {
                miner_id: m.id,
                user_id: actorId,
                source: "MANUAL",
                kind: "COMPONENT_UPDATED",
                notes: input.notes,
                details: {
                  scope: "port_assignment",
                  operation: op,
                  portId: port.portId,
                  gridCoordinate: port.coordinate,
                  before: {
                    locationId: m.locationId,
                    reservedPortId:
                      port.reservation?.id === m.id ? port.portId : null,
                  },
                  after: {
                    locationId: moved ? target : m.locationId,
                    reservedPortId:
                      op === "pull" && input.keepReservation
                        ? port.portId
                        : null,
                  },
                  inventoryOnly: true,
                },
              },
            })
          }
          if (
            port.occupant &&
            (op === "disable" || op === "replace" || op === "pull")
          )
            await changeMiner(
              port.occupant,
              op === "disable" || input.disposition === "UNASSIGNED"
            )
          if (
            port.reservation &&
            !affected.has(port.reservation.id) &&
            port.reservation.id !== incoming?.id &&
            clearReservation
          )
            await changeMiner(port.reservation, true)
          if (op === "pull" && input.keepReservation)
            await tx.port_index.update({
              where: { id: port.portId },
              data: { reserved_miner_id: port.occupant!.id },
            })
          if (op === "add" || op === "replace" || op === "return") {
            if (!incoming)
              throw new ActionError(400, "Choose the incoming miner.")
            await applyInventoryAction(tx, actorId, {
              kind: "move",
              minerId: incoming.id,
              version: incoming.version,
              locationId: port.locationId,
              notes: input.notes,
              submissionKey: placementKey(submissionKey, 0),
            })
            affected.add(incoming.id)
          }
          const result = {
            locationId: port.locationId,
            portId: port.portId,
            minerIds: [...affected],
            message:
              op === "disable"
                ? "Port disabled. Reservations released and any miner at this port marked unassigned in Atlas."
                : op === "enable"
                  ? "Port re-enabled. No reservation was restored."
                  : op === "release"
                    ? "Reservation released. The miner’s physical location was preserved."
                    : op === "pull"
                      ? "Miner pulled. Location and reservation history updated."
                      : op === "return"
                        ? "Reserved miner returned to its port."
                        : "Miner assignment updated.",
          }
          await tx.audit_log.create({
            data: {
              user_id: actorId,
              action: `PORT_${op.toUpperCase()}`,
              entity_type: "port_index",
              entity_id: port.portId,
              details: {
                submissionKey,
                fingerprint,
                before: port as unknown as Prisma.InputJsonValue,
                result,
                notes: input.notes,
              },
            },
          })
          return result
        },
        { isolationLevel: "Serializable", timeout: 60000 }
      )
    } catch (e) {
      const err = e as { code?: string; meta?: { code?: string } }
      if (
        (err.code === "P2034" ||
          ["40001", "40P01"].includes(err.meta?.code ?? "")) &&
        attempt < 2
      )
        continue
      if (e instanceof ActionError) throw e
      if (["P2002", "P2003", "P2004", "P2034"].includes(err.code ?? ""))
        throw new ActionError(
          409,
          "Inventory changed. Reload the port and try again."
        )
      throw e
    }
  }
  throw new ActionError(409, "Inventory changed. Please try again.")
}
