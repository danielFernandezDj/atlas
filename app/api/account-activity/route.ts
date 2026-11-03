import { prisma } from "@/lib/prisma"
import { actionActor, actionFailure } from "@/lib/inventory-actions/access"
import { ActionError } from "@/lib/inventory-actions/contracts"
export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  try {
    const actor = await actionActor(),
      page = Number(new URL(request.url).searchParams.get("page") ?? 1)
    if (!Number.isInteger(page) || page < 1 || page > 10000)
      throw new ActionError(400, "Invalid activity page.")
    const [total, entries] = await Promise.all([
      prisma.audit_log.count({ where: { user_id: actor.id } }),
      prisma.audit_log.findMany({
        where: { user_id: actor.id },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        skip: (page - 1) * 15,
        take: 15,
        select: {
          id: true,
          action: true,
          entity_type: true,
          entity_id: true,
          created_at: true,
        },
      }),
    ])
    return Response.json(
      {
        user: {
          name: `${actor.first_name} ${actor.last_name}`,
          email: actor.email,
          role: actor.role,
        },
        total,
        page,
        entries: entries.map((e) => ({
          ...e,
          created_at: e.created_at.toISOString(),
        })),
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e) {
    return actionFailure(e)
  }
}
