/**
 * Probes Postgres through the shared Prisma client and returns connectivity status.
 * It executes a read-only SELECT rather than loading or changing inventory records.
 */
import { prisma } from "@/lib/prisma"

export async function GET() {
  await prisma.$queryRaw`SELECT 1`

  return Response.json({ status: "ok", service: "postgres" })
}
