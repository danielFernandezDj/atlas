/**
 * Hosts PasswordRecoveryForm at the existing-account recovery URL. The client form
 * calls the auth service; this server page sets privacy metadata and writes no inventory.
 */
import { PasswordRecoveryForm } from "@/components/password-recovery-form"

export const metadata = {
  title: "Reset password | Atlas",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <PasswordRecoveryForm />
    </main>
  )
}
