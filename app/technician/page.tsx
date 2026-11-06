/**
 * Loads the authenticated technician workspace. Neon Auth supplies the identity,
 * lib/dashboard/read.ts checks active staff access and reads the database, then
 * workspace/technician-dashboard.tsx receives a serializable dashboard snapshot.
 */
import { AuthPanel } from "@/components/auth-panel"
import { TechnicianDashboard } from "@/components/technician/workspace/technician-dashboard"
import { auth } from "@/lib/auth/server"
import { readDashboard } from "@/lib/dashboard/read"
import { prisma } from "@/lib/prisma"

export const metadata = { title: "Technician workspace | Atlas" }
export const dynamic = "force-dynamic"

export default async function TechnicianPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string | string[] }>
}) {
  const { data: session, error } = await auth.getSession()
  if (error) throw error
  if (!session?.user) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
        <h1 className="text-2xl font-semibold">Sign in to Atlas</h1>
        <AuthPanel user={null} />
      </main>
    )
  }
  const result = await readDashboard(
    prisma,
    {
      email: session.user.email,
      emailVerified: session.user.emailVerified,
    },
    (await searchParams).site
  )
  if (result.status !== "ready") {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
        <h1 className="text-2xl font-semibold">
          {result.status === "verify-email"
            ? "Verify your email"
            : "Workspace access pending"}
        </h1>
        <p className="max-w-md text-center text-muted-foreground">
          {result.status === "verify-email"
            ? "Verify your sign-in email before accessing site records."
            : "Your account needs an active Atlas staff record. Ask your administrator to enable access."}
        </p>
        <AuthPanel
          user={{ name: session.user.name, email: session.user.email }}
        />
      </main>
    )
  }
  return (
    <TechnicianDashboard dashboard={result.dashboard} viewer={result.viewer} />
  )
}
