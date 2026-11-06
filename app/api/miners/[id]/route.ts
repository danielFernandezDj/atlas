/**
 * Serves the selected miner’s inventory, components and history to the miner workspace
 * and action forms. Authorization precedes lib/miners/read-inventory.ts reads; this
 * endpoint does not supply live firmware telemetry or accept edits.
 */
import { prisma } from "@/lib/prisma"
import { minerReadAccess, inventoryFailure } from "@/lib/miners/api-access"
import {
  InventoryInputError,
  parseMinerId,
  readMinerInventoryDetail,
} from "@/lib/miners/read-inventory"

export const dynamic = "force-dynamic"
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const denied = await minerReadAccess()
    if (denied) return denied
    const miner = await readMinerInventoryDetail(
      prisma,
      parseMinerId((await params).id)
    )
    return miner
      ? Response.json(miner, { headers: { "Cache-Control": "no-store" } })
      : Response.json(
          { message: "Miner not found." },
          { status: 404, headers: { "Cache-Control": "no-store" } }
        )
  } catch (error) {
    if (error instanceof InventoryInputError)
      return Response.json(
        { message: error.message },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      )
    return inventoryFailure(error)
  }
}
