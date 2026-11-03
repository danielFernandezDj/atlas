import { prisma } from "@/lib/prisma"
import { actionActor, actionFailure } from "@/lib/inventory-actions/access"
import {
  ActionError,
  actionSchema,
  insertSchema,
} from "@/lib/inventory-actions/contracts"
import {
  readActionOptions,
  readActionMiner,
  readActionLocations,
  locationSelect,
  locationLabel,
  activeLocation,
  isLocationAvailable,
} from "@/lib/inventory-actions/read"
import {
  performInventoryAction,
  performInsertBatch,
} from "@/lib/inventory-actions/write"
import { parseMinerId } from "@/lib/miners/read-inventory"
export const dynamic = "force-dynamic"
const headers = { "Cache-Control": "no-store" }
export async function GET(request: Request) {
  try {
    const actor = await actionActor()
    const p = new URL(request.url).searchParams,
      resource = p.get("resource") ?? "options"
    if (resource === "options")
      return Response.json(await readActionOptions(prisma, actor.role), {
        headers,
      })
    if (resource === "miner")
      return Response.json(
        await readActionMiner(prisma, parseMinerId(p.get("id") ?? "")),
        { headers }
      )
    if (resource === "locations")
      return Response.json(await readActionLocations(prisma, p), { headers })
    if (resource === "location") {
      const l = await prisma.locations.findUnique({
        where: { id: parseMinerId(p.get("id") ?? "") },
        select: locationSelect,
      })
      if (!l) throw new ActionError(404, "Location not found.")
      return Response.json(
        {
          id: l.id,
          label: locationLabel(l),
          kind: l.kind,
          active: activeLocation(l),
          available: isLocationAvailable(l),
          coordinate:
            l.kind === "DEPLOYMENT_SLOT"
              ? `${l.row_index}/${l.slot_index}`
              : null,
        },
        { headers }
      )
    }
    if (resource === "skeleton") {
      const serial = (p.get("serial") ?? "").trim()
      if (!serial || serial.length > 200)
        throw new ActionError(400, "Enter the skeleton serial number.")
      const s = await prisma.skeleton.findUnique({
        where: { serial_number: serial },
        select: { miner_id: true, condition: true },
      })
      if (s?.miner_id || s?.condition === "SCRAPPED")
        throw new ActionError(
          409,
          "This skeleton is already assigned or scrapped."
        )
      return Response.json({ available: true }, { headers })
    }
    throw new ActionError(400, "Unknown inventory request.")
  } catch (e) {
    return actionFailure(e)
  }
}
export async function POST(request: Request) {
  try {
    const actor = await actionActor(true)
    if (request.headers.get("origin") !== new URL(request.url).origin)
      throw new ActionError(403, "Submit inventory changes from Atlas.")
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new ActionError(415, "JSON is required.")
    const text = await request.text()
    if (text.length > 16000) throw new ActionError(413, "Request is too large.")
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      throw new ActionError(400, "Invalid request.")
    }
    if (
      typeof body === "object" &&
      body !== null &&
      "kind" in body &&
      body.kind === "insert"
    ) {
      const batch = insertSchema.safeParse(body)
      if (!batch.success)
        throw new ActionError(
          400,
          batch.error.issues[0]?.message ?? "Check the placements."
        )
      return Response.json(
        await performInsertBatch(prisma, actor.id, batch.data),
        { headers }
      )
    }
    const parsed = actionSchema.safeParse(body)
    if (!parsed.success)
      throw new ActionError(
        400,
        parsed.error.issues[0]?.message ?? "Check the action details."
      )
    return Response.json(
      await performInventoryAction(prisma, actor.id, parsed.data),
      { headers }
    )
  } catch (e) {
    return actionFailure(e)
  }
}
