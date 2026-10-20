import { redirect } from "next/navigation"

import { AuthPanel } from "@/components/auth-panel"
import { auth } from "@/lib/auth/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export default async function AccountPage() {
  const { data: session, error } = await auth.getSession()

  if (error) {
    throw error
  }

  if (!session?.user) {
    redirect("/")
  }

  await prisma.$queryRaw`SELECT 1`

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <div className="text-center">
          <p className="text-sm font-medium text-primary">Your account</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Protected by Neon Auth
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This page checks your session before querying Postgres.
          </p>
        </div>
        <AuthPanel
          user={{
            name: session.user.name,
            email: session.user.email,
          }}
        />
      </div>
    </main>
  )
}
