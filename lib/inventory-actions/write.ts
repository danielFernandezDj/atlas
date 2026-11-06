/**
 * Owns miner registration, metadata edits, movement and batch transactions behind
 * /api/inventory-actions. applyInventoryAction is also used by port-actions/write.ts
 * so port operations retain the same version, reservation, history and retry rules.
 *
 * Navigation: transaction retry wrapper; single-action authorization/receipts; creation and destination checks;
 * miner/component/history writes; movement/reservation writes; deterministic batch keys; batch transaction coordinator.
 * The single-action primitive stays together because its ordered locks and writes share one transaction.
 */
import "server-only"
import { createHash } from "node:crypto"
import type { PrismaClient, Prisma } from "@/lib/generated/prisma/client"
import {
  ActionError,
  canWriteInventory,
  type InventoryCommand,
  type InsertCommand,
  type CreateBatchCommand,
} from "./contracts"
import {
  locationSelect,
  activeLocation,
  fixedCompanies,
  isLocationAvailable,
} from "./read"
export type ActionResult = {
  minerId: number
  minerIds?: number[]
  message: string
}
function retryable(error: unknown) {
  const e = error as { code?: string; meta?: { code?: string } }
  return e.code === "P2034" || ["40001", "40P01"].includes(e.meta?.code ?? "")
}
// Transaction wrapper: serialization failures retry, domain failures preserve the draft for correction.
export async function performInventoryAction(
  db: Pick<PrismaClient, "$transaction">,
  actorId: number,
  input: InventoryCommand
): Promise<ActionResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(
        async (tx) => applyInventoryAction(tx, actorId, input),
        { isolationLevel: "Serializable", timeout: 20000 }
      )
    } catch (error) {
      if (retryable(error) && attempt < 2) continue
      if (error instanceof ActionError) throw error
      const e = error as { code?: string }
      if (["P2002", "P2003", "P2004", "P2034"].includes(e.code ?? ""))
        throw new ActionError(
          409,
          "Inventory changed or a serial/location is already in use. Refresh the details and try again."
        )
      throw error
    }
  }
  throw new ActionError(409, "Inventory changed. Please try again.")
}

// Single-action primitive: shared by miner actions, batches and contextual port operations.
export async function applyInventoryAction(
  tx: Prisma.TransactionClient,
  actorId: number,
  input: InventoryCommand
): Promise<ActionResult> {
  const { submissionKey, ...payload } = input
  const fingerprint = JSON.stringify(payload)

  await tx.$queryRaw`SELECT id FROM users WHERE id=${actorId} FOR SHARE`
  const actor = await tx.users.findUnique({
    where: { id: actorId },
    select: { is_active: true, role: true },
  })
  if (!actor?.is_active || !canWriteInventory(actor.role))
    throw new ActionError(403, "Your account cannot change inventory.")
  // Replay before checking mutable versions: a committed request may be retried with its original snapshot.
  const prior = await tx.audit_log.findFirst({
    where: {
      details: { path: ["submissionKey"], equals: submissionKey },
    },
    select: { user_id: true, details: true },
  })
  if (prior) {
    const details = prior.details as {
      fingerprint?: string
      result?: ActionResult
    }
    if (
      prior.user_id !== actorId ||
      details.fingerprint !== fingerprint ||
      !details.result?.minerId
    )
      throw new ActionError(
        409,
        "This submission key was already used for another change."
      )
    return details.result
  }
  await tx.$queryRaw`SELECT set_config('atlas.actor_id',${String(actorId)},true),set_config('atlas.source','MANUAL',true)`
  let before: Record<string, unknown> | null = null
  let minerId: number
  let sourceLocation: number | null = null
  if (input.kind !== "create") {
    await tx.$queryRaw`SELECT id FROM miners WHERE id=${input.minerId} FOR UPDATE`
    const existing = await tx.miner.findUnique({
      where: { id: input.minerId },
      select: {
        id: true,
        version: true,
        current_location_id: true,
        occupied_slot_id: true,
        owner_company_id: true,
        management_company_id: true,
        model_id: true,
        asset_tag: true,
        reserved_port: { select: { id: true, location_id: true } },
        history: {
          where: {
            kind: "INITIAL_STATE",
            details: { path: ["registrationState"], equals: "SCRAP" },
          },
          take: 1,
          select: { id: true },
        },
      },
    })
    if (!existing) throw new ActionError(404, "Miner not found.")
    if (existing.version !== input.version)
      throw new ActionError(
        409,
        "This miner changed after you opened it. Reload its details before saving."
      )
    before = existing
    minerId = existing.id
    sourceLocation = existing.current_location_id
  } else {
    const sk = await tx.skeleton.findUnique({
      where: { serial_number: input.skeletonSerial },
      select: { miner_id: true, condition: true },
    })
    if (sk?.miner_id || sk?.condition === "SCRAPPED")
      throw new ActionError(
        409,
        "That skeleton is already assigned or scrapped."
      )
    if (
      await tx.miner.findUnique({
        where: { serial_number: input.skeletonSerial },
        select: { id: true },
      })
    )
      throw new ActionError(
        409,
        "That serial number already belongs to a miner."
      )
    minerId = 0
  }
  if (input.kind !== "move") {
    if (
      input.modelId !== null &&
      !(await tx.miner_model.findUnique({
        where: { id: input.modelId },
        select: { id: true },
      }))
    )
      throw new ActionError(400, "Choose a valid miner model.")
  }
  const assignment =
    input.kind === "create"
      ? fixedCompanies(
          await tx.companies.findMany({ select: { id: true, name: true } })
        )
      : null
  if (input.kind === "create" && !assignment)
    throw new ActionError(
      409,
      "Configure Ionic and DigitalCarpenter.io company records before creating miners."
    )
  let destination: Awaited<
    ReturnType<
      typeof tx.locations.findUnique<{
        where: { id: number }
        select: typeof locationSelect
      }>
    >
  > | null = null
  let targetPort: {
    id: number
    reserved_miner_id: number | null
    active: boolean
    switch: { active: boolean }
  } | null = null
  if (
    input.kind === "move" ||
    (input.kind === "create" && input.registrationState === "SCRAP")
  ) {
    destination = await tx.locations.findUnique({
      where: {
        id: input.kind === "create" ? input.palletId! : input.locationId,
      },
      select: locationSelect,
    })
    if (!destination || !activeLocation(destination))
      throw new ActionError(409, "Choose an active destination location.")
    if (input.kind === "move" && sourceLocation === destination.id)
      throw new ActionError(409, "The miner is already at that location.")
    if (input.kind === "create" && destination.kind !== "PALLET")
      throw new ActionError(
        400,
        "Scrap miners must be assigned to an active pallet."
      )
    if (
      input.kind === "move" &&
      destination.kind === "DEPLOYMENT_SLOT" &&
      (before?.history as unknown[] | undefined)?.length
    )
      throw new ActionError(
        409,
        "This miner was registered as scrap and cannot be deployed."
      )
    if (input.kind !== "create" && !isLocationAvailable(destination))
      throw new ActionError(
        409,
        "This location is occupied, reserved, inactive, or has no active port. Choose an available location."
      )
    if (destination.kind === "DEPLOYMENT_SLOT") {
      targetPort = await tx.port_index.findUnique({
        where: { location_id: destination.id },
        select: {
          id: true,
          reserved_miner_id: true,
          active: true,
          switch: { select: { active: true } },
        },
      })
      if (targetPort && (!targetPort.active || !targetPort.switch.active))
        throw new ActionError(
          409,
          "The destination port or switch is inactive."
        )
      if (
        targetPort?.reserved_miner_id &&
        targetPort.reserved_miner_id !== minerId
      )
        throw new ActionError(409, "This port is reserved for another miner.")
      if (
        await tx.miner.findFirst({
          where: {
            OR: [
              { current_location_id: destination.id },
              { occupied_slot_id: destination.id },
            ],
            ...(minerId ? { id: { not: minerId } } : {}),
          },
          select: { id: true },
        })
      )
        throw new ActionError(409, "Another miner occupies that location.")
    }
  }
  // Registration records real skeleton identity and presence evidence without fabricating boards.
  if (input.kind === "create") {
    const m = await tx.miner.create({
      data: {
        serial_number: input.skeletonSerial,
        asset_tag: input.assetTag || null,
        owner_company_id: assignment!.owner.id,
        management_company_id: assignment!.manager.id,
        model_id: input.modelId,
        current_location_id: destination?.id ?? null,
        occupied_slot_id: null,
      },
      select: { id: true },
    })
    minerId = m.id
    const sk = await tx.skeleton.findUnique({
      where: { serial_number: input.skeletonSerial },
      select: { id: true, miner_id: true, condition: true },
    })
    if (sk) {
      const assigned = await tx.skeleton.updateMany({
        where: {
          id: sk.id,
          miner_id: null,
          condition: { not: "SCRAPPED" },
        },
        data: { miner_id: minerId },
      })
      if (assigned.count !== 1)
        throw new ActionError(
          409,
          "That skeleton was assigned by someone else."
        )
    } else
      await tx.skeleton.create({
        data: {
          serial_number: input.skeletonSerial,
          miner_id: minerId,
        },
      })
    await tx.miner_history.create({
      data: {
        miner_id: minerId,
        kind: "INITIAL_STATE",
        user_id: actorId,
        source: "MANUAL",
        notes: input.notes || null,
        details: {
          registrationState: input.registrationState,
          componentConfirmation: input.componentConfirmation
            ? {
                ...input.componentConfirmation,
                confirmedByUserId: actorId,
                confirmedAt: new Date().toISOString(),
                statementVersion: "scrap-assembly-v1",
                powerSupplyPresent: input.powerSupplyPresent,
                identifiersRecorded: false,
              }
            : null,
          palletId: input.palletId,
          skeletonSerial: input.skeletonSerial,
          ownerId: assignment!.owner.id,
          managerId: assignment!.manager.id,
          modelId: input.modelId,
        },
      },
    })
  } else if (input.kind === "edit") {
    const data = {
      asset_tag: input.assetTag || null,
      model_id: input.modelId,
    }
    if (Object.entries(data).every(([key, value]) => before![key] === value))
      throw new ActionError(400, "No miner details changed.")
    const updated = await tx.miner.updateMany({
      where: { id: minerId, version: input.version },
      data: { ...data, version: { increment: 1 } },
    })
    if (updated.count !== 1)
      throw new ActionError(409, "Miner changed. Reload before saving.")
    await tx.miner_history.create({
      data: {
        miner_id: minerId,
        kind: "COMPONENT_UPDATED",
        user_id: actorId,
        source: "MANUAL",
        notes: input.notes,
        details: {
          scope: "miner_metadata",
          before: before as Prisma.InputJsonValue,
          after: data,
        },
      },
    })
  } else {
    const updated = await tx.miner.updateMany({
      where: { id: minerId, version: input.version },
      data: {
        current_location_id: destination!.id,
        occupied_slot_id:
          destination!.kind === "DEPLOYMENT_SLOT" ? destination!.id : null,
        version: { increment: 1 },
      },
    })
    if (updated.count !== 1)
      throw new ActionError(409, "Miner changed. Reload before saving.")
  }
  if (destination?.kind === "DEPLOYMENT_SLOT") {
    await tx.port_index.updateMany({
      where: {
        reserved_miner_id: minerId,
        ...(targetPort ? { id: { not: targetPort.id } } : {}),
      },
      data: { reserved_miner_id: null },
    })
    if (targetPort) {
      const reserved = await tx.port_index.updateMany({
        where: {
          id: targetPort.id,
          OR: [{ reserved_miner_id: null }, { reserved_miner_id: minerId }],
        },
        data: { reserved_miner_id: minerId },
      })
      if (reserved.count !== 1)
        throw new ActionError(
          409,
          "The destination was reserved by someone else."
        )
    }
  }
  if (destination) {
    await tx.miner_movements.create({
      data: {
        miner_id: minerId,
        recorded_by_id: actorId,
        source: "MANUAL",
        from_location_id: sourceLocation,
        to_location_id: destination.id,
        reason:
          input.kind === "create"
            ? "INITIAL_REGISTRATION"
            : destination.kind === "REPAIR"
              ? "REPAIR"
              : destination.kind === "DEPLOYMENT_SLOT"
                ? "DEPLOYMENT"
                : "RELOCATION",
        notes: input.notes,
        submission_key: submissionKey,
      },
    })
  }
  const result = {
    minerId,
    message:
      input.kind === "create"
        ? "Miner created."
        : input.kind === "move"
          ? "Miner location updated."
          : "Miner details updated.",
  }
  await tx.audit_log.create({
    data: {
      user_id: actorId,
      action: `MINER_${input.kind.toUpperCase()}`,
      entity_type: "miners",
      entity_id: minerId,
      details: {
        submissionKey,
        fingerprint,
        before: before as Prisma.InputJsonValue,
        result,
        after: payload,
      },
    },
  })
  return result
}

// Stable child keys let one batch reuse the same single-action primitive without duplicating receipts.
export function placementKey(batchKey: string, index: number) {
  const hex = createHash("sha256").update(`${batchKey}:${index}`).digest("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}
export function performInsertBatch(
  db: Pick<PrismaClient, "$transaction">,
  actorId: number,
  input: InsertCommand
) {
  return performInventoryBatch(db, actorId, input)
}
export function performCreateBatch(
  db: Pick<PrismaClient, "$transaction">,
  actorId: number,
  input: CreateBatchCommand
) {
  return performInventoryBatch(db, actorId, input)
}
// Batch coordinator: every child mutation shares one transaction, so partial batches never persist.
async function performInventoryBatch(
  db: Pick<PrismaClient, "$transaction">,
  actorId: number,
  input: InsertCommand | CreateBatchCommand
): Promise<ActionResult> {
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
          const fingerprint = JSON.stringify({
            entries: input.entries,
            notes: input.notes,
          })
          const prior = await tx.audit_log.findFirst({
            where: {
              details: { path: ["submissionKey"], equals: input.submissionKey },
            },
            select: { user_id: true, details: true },
          })
          if (prior) {
            const d = prior.details as {
              fingerprint?: string
              result?: ActionResult
            }
            if (
              prior.user_id !== actorId ||
              d.fingerprint !== fingerprint ||
              !d.result?.minerIds
            )
              throw new ActionError(
                409,
                "This submission key was already used for another change."
              )
            return d.result
          }
          const results: ActionResult[] = []
          for (let index = 0; index < input.entries.length; index++) {
            if (input.kind === "create-batch") {
              results.push(
                await applyInventoryAction(tx, actorId, {
                  kind: "create",
                  ...input.entries[index],
                  submissionKey: placementKey(input.submissionKey, index),
                })
              )
            } else {
              const entry = input.entries[index]
              const location = await tx.locations.findUnique({
                where: { id: entry.locationId },
                select: { kind: true },
              })
              if (location?.kind !== "DEPLOYMENT_SLOT")
                throw new ActionError(
                  400,
                  "Insert miners requires deployment ports."
                )
              results.push(
                await applyInventoryAction(tx, actorId, {
                  kind: "move",
                  ...entry,
                  notes: input.notes,
                  submissionKey: placementKey(input.submissionKey, index),
                })
              )
            }
          }
          const result = {
            minerId: results[0].minerId,
            minerIds: results.map((r) => r.minerId),
            message:
              input.kind === "create-batch"
                ? `${results.length} miners created. Registration history and scrap acknowledgments recorded.`
                : `${results.length} miners inserted. Movement history and reservations updated.`,
          }
          await tx.audit_log.create({
            data: {
              user_id: actorId,
              action:
                input.kind === "create-batch"
                  ? "MINER_CREATE_BATCH"
                  : "MINER_INSERT_BATCH",
              entity_type: "miners",
              entity_id: result.minerId,
              details: {
                submissionKey: input.submissionKey,
                fingerprint,
                result,
              },
            },
          })
          return result
        },
        { isolationLevel: "Serializable", timeout: 60000 }
      )
    } catch (e) {
      if (retryable(e) && attempt < 2) continue
      if (e instanceof ActionError) throw e
      if (
        ["P2002", "P2003", "P2004", "P2034"].includes(
          (e as { code?: string }).code ?? ""
        )
      )
        throw new ActionError(
          409,
          "Inventory changed. Refresh the placements and try again."
        )
      throw e
    }
  }
  throw new ActionError(409, "Inventory changed. Please try again.")
}
