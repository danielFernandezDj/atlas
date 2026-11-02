import "server-only"
import { auth } from "@/lib/auth/server"
import { prisma } from "@/lib/prisma"

export async function minerReadAccess() {
  const { data: session, error } = await auth.getSession()
  if (error) throw error
  if (!session?.user)
    return Response.json(
      { message: "Sign in to view miner inventory." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    )
  if (!session.user.emailVerified)
    return Response.json(
      { message: "Verify your email before accessing inventory." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    )
  const staff = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: { is_active: true },
  })
  if (!staff?.is_active)
    return Response.json(
      { message: "An active Atlas staff record is required." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    )
  return null
}

export function inventoryFailure(error: unknown) {
  console.error("[miners] Read failed", {
    name: error instanceof Error ? error.name : "Unknown",
  })
  return Response.json(
    {
      message: "Miner inventory is temporarily unavailable. Please try again.",
    },
    { status: 503, headers: { "Cache-Control": "no-store" } }
  )
}
