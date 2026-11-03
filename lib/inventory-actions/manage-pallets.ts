import "server-only"
import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client"
import {
  ActionError,
  canWriteInventory,
  type ManagePalletCommand,
  type PalletPage,
} from "./contracts"
const select = {
  id: true,
  kind: true,
  name: true,
  code: true,
  site_id: true,
  is_active: true,
  site: { select: { name: true, is_active: true } },
  _count: {
    select: {
      current_miners: true,
      ports: true,
      movements_from: true,
      movements_to: true,
    },
  },
} as const
export async function readPallets(
  db: Pick<PrismaClient, "locations" | "$queryRaw">,
  params: URLSearchParams
): Promise<PalletPage> {
  const page = Number(params.get("page") ?? 1),
    site = Number(params.get("site") ?? 0),
    search = (params.get("search") ?? "").trim()
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 100000 ||
    !Number.isSafeInteger(site) ||
    site < 0 ||
    site > 2147483647 ||
    search.length > 200
  )
    throw new ActionError(400, "Check the pallet filters.")
  const where = {
    kind: "PALLET" as const,
    ...(site ? { site_id: site } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { code: { contains: search, mode: "insensitive" as const } },
            {
              site: {
                name: { contains: search, mode: "insensitive" as const },
              },
            },
          ],
        }
      : {}),
  }
  const [rows, total] = await Promise.all([
    db.locations.findMany({
      where,
      select,
      orderBy: [{ site_id: "asc" }, { code: "asc" }, { id: "asc" }],
      skip: (page - 1) * 50,
      take: 50,
    }),
    db.locations.count({ where }),
  ])
  const initial = rows.length
    ? await db.$queryRaw<Array<{ id: number }>>(Prisma.sql`
    SELECT l.id FROM locations l
    WHERE l.id IN (${Prisma.join(rows.map((r) => r.id))})
    AND EXISTS (SELECT 1 FROM miner_history h WHERE h.details->'palletId' = to_jsonb(l.id))
  `)
    : []
  const usedIds = new Set(initial.map((r) => r.id))
  return {
    page,
    total,
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      siteId: r.site_id,
      siteName: r.site.name,
      active: r.is_active,
      siteActive: r.site.is_active,
      minerCount: r._count.current_miners,
      used: usedIds.has(r.id) || Object.values(r._count).some((n) => n > 0),
    })),
  }
}
export async function performManagePallet(
  db: Pick<PrismaClient, "$transaction">,
  actorId: number,
  input: ManagePalletCommand
) {
  const { submissionKey, ...payload } = input,
    fingerprint = JSON.stringify(payload)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM users WHERE id=${actorId} FOR SHARE`
          const actor = await tx.users.findUnique({
            where: { id: actorId },
            select: { role: true, is_active: true },
          })
          if (!actor?.is_active || !canWriteInventory(actor.role))
            throw new ActionError(403, "Your account cannot manage pallets.")
          const prior = await tx.audit_log.findFirst({
            where: {
              details: { path: ["submissionKey"], equals: submissionKey },
            },
            select: { user_id: true, details: true },
          })
          if (prior) {
            const d = prior.details as {
              fingerprint?: string
              result?: { message: string }
            }
            if (
              prior.user_id !== actorId ||
              d.fingerprint !== fingerprint ||
              !d.result
            )
              throw new ActionError(
                409,
                "This submission key was already used for another change."
              )
            return d.result
          }
          await tx.$queryRaw`SELECT id FROM locations WHERE id=${input.palletId} FOR UPDATE`
          const pallet = await tx.locations.findUnique({
            where: { id: input.palletId },
            select,
          })
          if (!pallet || pallet.kind !== "PALLET")
            throw new ActionError(404, "Pallet not found. Refresh the list.")
          if (
            pallet.name !== input.expected.name ||
            pallet.code !== input.expected.code ||
            pallet.is_active !== input.expected.active
          )
            throw new ActionError(
              409,
              "This pallet changed. Reload the list before saving."
            )
          const occupied =
            pallet._count.current_miners > 0 || pallet._count.ports > 0
          if (["archive", "delete"].includes(input.operation) && occupied)
            throw new ActionError(
              409,
              "Move all miners off this pallet before archiving or deleting it."
            )
          if (input.operation === "delete") {
            const initial = await tx.miner_history.findFirst({
              where: { details: { path: ["palletId"], equals: pallet.id } },
              select: { id: true },
            })
            if (
              pallet._count.movements_from ||
              pallet._count.movements_to ||
              initial
            )
              throw new ActionError(
                409,
                "This pallet has been used. Archive it to preserve its history."
              )
          }
          if (input.operation === "restore" && !pallet.site.is_active)
            throw new ActionError(
              409,
              "The site must be active before restoring this pallet."
            )
          if (input.operation === "update") {
            const duplicate = await tx.locations.findFirst({
              where: {
                id: { not: pallet.id },
                site_id: pallet.site_id,
                code: { equals: input.code, mode: "insensitive" },
              },
              select: { id: true },
            })
            if (duplicate)
              throw new ActionError(
                409,
                "This code is already used at this site."
              )
            if (input.name === pallet.name && input.code === pallet.code)
              throw new ActionError(
                400,
                "Change the name or code before saving."
              )
          }
          if (
            (input.operation === "archive" && !pallet.is_active) ||
            (input.operation === "restore" && pallet.is_active)
          )
            throw new ActionError(
              409,
              "This pallet already has that status. Reload the list."
            )
          await tx.$queryRaw`SELECT set_config('atlas.actor_id',${String(actorId)},true),set_config('atlas.source','MANUAL',true)`
          const before = {
            name: pallet.name,
            code: pallet.code,
            active: pallet.is_active,
            siteId: pallet.site_id,
          }
          const after =
            input.operation === "delete"
              ? null
              : {
                  ...before,
                  ...(input.operation === "update"
                    ? { name: input.name, code: input.code }
                    : { active: input.operation === "restore" }),
                }
          if (input.operation === "delete")
            await tx.locations.delete({ where: { id: pallet.id } })
          else
            await tx.locations.update({
              where: { id: pallet.id },
              data:
                input.operation === "update"
                  ? { name: input.name, code: input.code }
                  : { is_active: input.operation === "restore" },
            })
          const result = {
            message:
              input.operation === "update"
                ? "Pallet updated."
                : input.operation === "archive"
                  ? "Pallet archived."
                  : input.operation === "restore"
                    ? "Pallet restored."
                    : "Pallet deleted.",
          }
          await tx.audit_log.create({
            data: {
              user_id: actorId,
              action: `PALLET_${input.operation.toUpperCase()}`,
              entity_type: "locations",
              entity_id: pallet.id,
              details: {
                submissionKey,
                fingerprint,
                result,
                notes: input.notes,
                before,
                after,
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
        throw new ActionError(409, "This code is already used at this site.")
      if (["P2003", "P2004", "P2025", "P2034"].includes(err.code ?? ""))
        throw new ActionError(
          409,
          "Pallet inventory changed. Reload the list and try again."
        )
      throw e
    }
  }
  throw new ActionError(409, "Pallet inventory changed. Try again.")
}
