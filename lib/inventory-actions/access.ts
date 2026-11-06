/**
 * Resolves the verified Neon Auth session to an active Atlas staff record for
 * inventory and port API routes. Write access is derived from the stored role;
 * actionFailure translates known errors without exposing database details.
 */
import "server-only"
import { auth } from "@/lib/auth/server"
import { prisma } from "@/lib/prisma"
import { InventoryInputError } from "@/lib/miners/read-inventory"
import { ActionError, canWriteInventory } from "./contracts"
export async function actionActor(write = false) {
  const { data: session, error } = await auth.getSession()
  if (error) throw error
  if (!session?.user) throw new ActionError(401, "Sign in to Atlas first.")
  if (!session.user.emailVerified)
    throw new ActionError(403, "Verify your email first.")
  const staff = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      first_name: true,
      last_name: true,
      email: true,
      role: true,
      is_active: true,
    },
  })
  if (!staff?.is_active)
    throw new ActionError(403, "An active Atlas staff record is required.")
  if (write && !canWriteInventory(staff.role))
    throw new ActionError(403, "Viewer accounts have read-only access.")
  return staff
}
export function actionFailure(error: unknown) {
  if (error instanceof InventoryInputError)
    return Response.json(
      { message: error.message },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    )
  if (error instanceof ActionError)
    return Response.json(
      { message: error.message },
      { status: error.status, headers: { "Cache-Control": "no-store" } }
    )
  console.error("[inventory-actions] Request failed", {
    name: error instanceof Error ? error.name : "Unknown",
  })
  return Response.json(
    { message: "The request could not be completed. Please try again." },
    { status: 503, headers: { "Cache-Control": "no-store" } }
  )
}
