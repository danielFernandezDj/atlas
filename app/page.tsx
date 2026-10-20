import { AuthPanel } from "@/components/auth-panel"
import { auth } from "@/lib/auth/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export default async function Page() {
  const [databaseResult, sessionResult] = await Promise.all([
    prisma.$queryRaw<Array<{ connected: number }>>`SELECT 1 AS connected`,
    auth.getSession(),
  ])

  if (sessionResult.error) {
    throw sessionResult.error
  }

  const user = sessionResult.data?.user

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="flex w-full max-w-2xl flex-col items-center gap-8">
        <div className="text-center">
          <p className="text-sm font-medium text-primary">Atlas</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Neon services are connected
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Postgres and Neon Auth are ready to use.
          </p>
        </div>
        <div className="grid w-full gap-3 sm:grid-cols-2">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">Neon Postgres</p>
            <p className="mt-1 font-medium">
              {databaseResult[0]?.connected === 1 ? "Connected" : "Unavailable"}
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">Neon Auth</p>
            <p className="mt-1 font-medium">
              {user ? "Signed in" : "Ready to sign in"}
            </p>
          </div>
        </div>
        <AuthPanel
          user={user ? { name: user.name, email: user.email } : null}
        />
      </div>
    </main>
  )
}
