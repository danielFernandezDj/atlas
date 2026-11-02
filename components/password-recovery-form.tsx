"use client"

import Link from "next/link"
import { useEffect, useState, type FormEvent } from "react"
import { authClient } from "@/lib/auth/client"
import {
  completePasswordRecovery,
  recoveryConfirmation,
  requestRecoveryCode,
} from "@/lib/auth/password-recovery"
import { Button } from "@/components/ui/button"

export function PasswordRecoveryForm() {
  const [step, setStep] = useState<"request" | "reset" | "complete">("request")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  async function sendCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    if (pending || cooldown > 0) return
    setPending(true)
    setError("")
    try {
      const result = await requestRecoveryCode(authClient, email)
      if (!result.ok) {
        setError(result.message)
        return
      }
      setEmail(email.trim().toLowerCase())
      setCode("")
      setStep("reset")
      setCooldown(30)
    } finally {
      setPending(false)
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError("")
    try {
      const result = await completePasswordRecovery(authClient, {
        email,
        code,
        password,
        confirmation,
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      setCode("")
      setPassword("")
      setConfirmation("")
      setStep("complete")
    } finally {
      setPending(false)
    }
  }

  const field = "h-10 rounded-md border bg-background px-3"
  return (
    <section
      className="w-full max-w-md rounded-xl border bg-card p-6 text-card-foreground shadow-sm"
      aria-busy={pending}
    >
      <h1 className="mb-2 text-2xl font-semibold">
        {step === "complete" ? "Password updated" : "Reset your password"}
      </h1>
      {step === "request" ? (
        <>
          <p className="mb-5 text-sm text-muted-foreground">
            Enter your Atlas login email. We’ll send you a one-time reset code.
          </p>
          <form className="flex flex-col gap-4" onSubmit={sendCode}>
            <label className="flex flex-col gap-1.5 text-sm">
              Email
              <input
                autoComplete="email"
                type="email"
                required
                value={email}
                disabled={pending}
                onChange={(event) => setEmail(event.target.value)}
                className={field}
              />
            </label>
            <Button type="submit" disabled={pending || cooldown > 0}>
              {pending
                ? "Requesting code…"
                : cooldown > 0
                  ? `Try again in ${cooldown}s`
                  : "Send reset code"}
            </Button>
          </form>
        </>
      ) : step === "reset" ? (
        <>
          <p className="mb-3 text-sm text-muted-foreground" role="status">
            {recoveryConfirmation}
          </p>
          <p className="mb-5 text-sm break-all">
            Resetting password for <strong>{email}</strong>
          </p>
          <form className="flex flex-col gap-4" onSubmit={resetPassword}>
            <label className="flex flex-col gap-1.5 text-sm">
              Email code
              <input
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{4,12}"
                minLength={4}
                maxLength={12}
                required
                value={code}
                disabled={pending}
                onChange={(event) => setCode(event.target.value)}
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              New password
              <input
                autoComplete="new-password"
                type="password"
                minLength={8}
                maxLength={128}
                required
                value={password}
                disabled={pending}
                onChange={(event) => setPassword(event.target.value)}
                className={field}
              />
              <span className="text-xs text-muted-foreground">
                8–128 characters
              </span>
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              Confirm new password
              <input
                autoComplete="new-password"
                type="password"
                minLength={8}
                maxLength={128}
                required
                value={confirmation}
                disabled={pending}
                onChange={(event) => setConfirmation(event.target.value)}
                className={field}
              />
            </label>
            <Button type="submit" disabled={pending}>
              {pending ? "Updating password…" : "Update password"}
            </Button>
          </form>
          <div className="mt-4 flex flex-wrap justify-between gap-3 text-sm">
            <button
              type="button"
              disabled={pending || cooldown > 0}
              onClick={() => void sendCode()}
              className="underline underline-offset-4 disabled:opacity-50"
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setStep("request")
                setError("")
                setCode("")
                setPassword("")
                setConfirmation("")
              }}
              className="underline underline-offset-4"
            >
              Use another email
            </button>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground" role="status">
          Your password has been saved. Return to Atlas and sign in with your
          new password.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      <Link
        href="/technician"
        className="mt-5 inline-block text-sm underline underline-offset-4"
      >
        Back to sign in
      </Link>
    </section>
  )
}
