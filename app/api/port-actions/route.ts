/**
 * Connects map port actions to lib/port-actions/read.ts and write.ts. GET returns
 * port snapshots and destinations; POST verifies staff and strict commands before
 * transactional changes to placement, reservations, history and audit records.
 */
import { prisma } from "@/lib/prisma"
import { actionActor, actionFailure } from "@/lib/inventory-actions/access"
import {
  ActionError,
  canWriteInventory,
} from "@/lib/inventory-actions/contracts"
import { parseMinerId } from "@/lib/miners/read-inventory"
import { portCommandSchema } from "@/lib/port-actions/contracts"
import { readPortDetail, readPortDestinations } from "@/lib/port-actions/read"
import { performPortAction } from "@/lib/port-actions/write"
export const dynamic = "force-dynamic"
const headers = { "Cache-Control": "no-store" }
export async function GET(request: Request) {
  try {
    const actor = await actionActor(),
      params = new URL(request.url).searchParams
    if (params.get("resource") === "destinations")
      return Response.json(await readPortDestinations(prisma, params), {
        headers,
      })
    const [port, sites] = await Promise.all([
      readPortDetail(prisma, parseMinerId(params.get("locationId") ?? "")),
      prisma.sites.findMany({
        where: { is_active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ])
    const latest = await prisma.audit_log.findFirst({
      where: { entity_type: "port_index", entity_id: port.portId },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      select: {
        action: true,
        details: true,
        created_at: true,
        user: { select: { first_name: true, last_name: true } },
      },
    })
    const latestDetails = latest?.details as { notes?: unknown } | null
    const lastChange = latest
      ? {
          action: latest.action,
          notes:
            typeof latestDetails?.notes === "string"
              ? latestDetails.notes
              : null,
          by: latest.user
            ? `${latest.user.first_name} ${latest.user.last_name}`.trim()
            : "System",
          at: latest.created_at.toISOString(),
        }
      : null
    return Response.json(
      { port, sites, canWrite: canWriteInventory(actor.role), lastChange },
      { headers }
    )
  } catch (e) {
    return actionFailure(e)
  }
}
export async function POST(request: Request) {
  try {
    const actor = await actionActor(true)
    if (request.headers.get("origin") !== new URL(request.url).origin)
      throw new ActionError(403, "Submit port changes from Atlas.")
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
    const parsed = portCommandSchema.safeParse(body)
    if (!parsed.success)
      throw new ActionError(
        400,
        parsed.error.issues[0]?.message ?? "Check the port action."
      )
    return Response.json(
      await performPortAction(prisma, actor.id, parsed.data),
      { headers }
    )
  } catch (e) {
    return actionFailure(e)
  }
}
