import { prisma } from "@/lib/prisma"

export async function GET() {
  await prisma.$queryRaw`SELECT 1`

  return Response.json({ status: "ok", service: "postgres" })
}
