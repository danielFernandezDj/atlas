/**
 * Serves the paginated miner directory used by miners/miner-inventory-search.tsx
 * and the action miner picker. minerReadAccess authorizes the request before
 * lib/miners/read-inventory.ts queries and serializes database records.
 */
import { prisma } from "@/lib/prisma"
import { minerReadAccess, inventoryFailure } from "@/lib/miners/api-access"
import {
  InventoryInputError,
  parseInventoryQuery,
  readMinerInventory,
} from "@/lib/miners/read-inventory"

export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  try {
    const denied = await minerReadAccess()
    if (denied) return denied
    const query = parseInventoryQuery(new URL(request.url).searchParams)
    return Response.json(await readMinerInventory(prisma, query), {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    if (error instanceof InventoryInputError)
      return Response.json(
        { message: error.message },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      )
    return inventoryFailure(error)
  }
}
