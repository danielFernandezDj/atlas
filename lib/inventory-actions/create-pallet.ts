import "server-only"
import type { PrismaClient } from "@/lib/generated/prisma/client"
import {
  ActionError,
  canWriteInventory,
  type CreatePalletCommand,
} from "./contracts"
export type PalletResult = {
  locationId: number
  name: string
  code: string
  siteName: string
  message: string
}
export async function performCreatePallet(
  db: Pick<PrismaClient, "$transaction">,
  actorId: number,
  input: CreatePalletCommand
): Promise<PalletResult> {
  const { submissionKey, ...payload } = input,
    fingerprint = JSON.stringify(payload)
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
            throw new ActionError(403, "Your account cannot create pallets.")
          const prior = await tx.audit_log.findFirst({
            where: {
              details: { path: ["submissionKey"], equals: submissionKey },
            },
            select: { user_id: true, details: true },
          })
          if (prior) {
            const d = prior.details as {
              fingerprint?: string
              result?: PalletResult
            }
            if (
              prior.user_id !== actorId ||
              d.fingerprint !== fingerprint ||
              !d.result?.locationId
            )
              throw new ActionError(
                409,
                "This submission key was already used for another change."
              )
            return d.result
          }
          await tx.$queryRaw`SELECT id FROM sites WHERE id=${input.siteId} FOR SHARE`
          const site = await tx.sites.findUnique({
            where: { id: input.siteId },
            select: { id: true, name: true, is_active: true },
          })
          if (!site || !site.is_active)
            throw new ActionError(409, "Choose an active site for this pallet.")
          const duplicate = await tx.locations.findFirst({
            where: {
              site_id: site.id,
              code: { equals: input.code, mode: "insensitive" },
            },
            select: { id: true },
          })
          if (duplicate)
            throw new ActionError(
              409,
              "A location with this pallet code already exists at this site. Choose another code."
            )
          await tx.$queryRaw`SELECT set_config('atlas.actor_id',${String(actorId)},true),set_config('atlas.source','MANUAL',true)`
          const pallet = await tx.locations.create({
            data: {
              site_id: site.id,
              kind: "PALLET",
              name: input.name,
              code: input.code,
              is_active: true,
              building_id: null,
              can_id: null,
              row_index: null,
              slot_index: null,
            },
            select: { id: true, name: true, code: true },
          })
          const result = {
            locationId: pallet.id,
            name: pallet.name,
            code: pallet.code,
            siteName: site.name,
            message: "Pallet created.",
          }
          await tx.audit_log.create({
            data: {
              user_id: actorId,
              action: "PALLET_CREATE",
              entity_type: "locations",
              entity_id: pallet.id,
              details: {
                submissionKey,
                fingerprint,
                result,
                notes: input.notes,
                after: { ...payload, kind: "PALLET", is_active: true },
              },
            },
          })
          return result
        },
        { isolationLevel: "Serializable", timeout: 20000 }
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
      if (err.code === "P2002")
        throw new ActionError(
          409,
          "This pallet code is already in use at this site."
        )
      if (["P2003", "P2004", "P2034"].includes(err.code ?? ""))
        throw new ActionError(
          409,
          "Site inventory changed. Refresh and try again."
        )
      throw e
    }
  }
  throw new ActionError(409, "Site inventory changed. Please try again.")
}
