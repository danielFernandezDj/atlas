import { prisma } from "@/lib/prisma"
import { minerReadAccess } from "@/lib/miners/api-access"
import { parseMinerId, InventoryInputError } from "@/lib/miners/read-inventory"
import { readBuildingMapSummary } from "@/lib/site-map/read-live"
export const dynamic = "force-dynamic"
const headers = { "Cache-Control": "no-store" }
export async function GET(request: Request) {
  try {
    const denied = await minerReadAccess()
    if (denied) return denied
    const params = new URL(request.url).searchParams
    if (
      params.getAll("site").length !== 1 ||
      params.getAll("building").length !== 1
    )
      throw new InventoryInputError("Choose a site and building.")
    const result = await readBuildingMapSummary(
      prisma,
      parseMinerId(params.get("site")!),
      parseMinerId(params.get("building")!)
    )
    return result
      ? Response.json(result, { headers })
      : Response.json(
          { message: "Building not found at this site." },
          { status: 404, headers }
        )
  } catch (error) {
    if (error instanceof InventoryInputError)
      return Response.json({ message: error.message }, { status: 400, headers })
    console.error("[site-map] Read failed", {
      name: error instanceof Error ? error.name : "Unknown",
    })
    return Response.json(
      {
        message:
          "Building inventory is temporarily unavailable. Please try again.",
      },
      { status: 503, headers }
    )
  }
}
