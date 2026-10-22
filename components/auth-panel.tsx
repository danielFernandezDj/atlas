"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"

import { authClient } from "@/lib/auth/client"
import { Button } from "@/components/ui/button"

type AuthUser = {
  name: string
  email: string
}

export function AuthPanel({ user }: { user: AuthUser | null }) {
  const router = useRouter()
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setMessage("")
    setPending(true)

    try {
      const result =
        mode === "sign-up"
          ? await authClient.signUp.email({ name, email, password })
          : await authClient.signIn.email({ email, password })

      if (result.error) {
        setError(result.error.message ?? "Authentication request failed.")
        return
      }

      setMessage(
        mode === "sign-up"
          ? "Account created. Check your email if verification is enabled."
          : "Signed in successfully.",
      )
      router.refresh()
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Authentication request failed.",
      )
    } finally {
      setPending(false)
    }
  }

  async function handleSignOut() {
    setError("")
    setMessage("")
    setPending(true)

    try {
      const result = await authClient.signOut()
      if (result.error) {
        setError(result.error.message ?? "Sign-out request failed.")
        return
      }

      setMessage("Signed out successfully.")
      router.refresh()
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Sign-out request failed.",
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="w-full max-w-md rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
      {user ? (
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Signed in as</p>
            <p className="font-medium">{user.name}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={handleSignOut}
          >
            {pending ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-5 flex gap-4 border-b">
            <button
              type="button"
              className={`-mb-px border-b-2 px-1 pb-2 text-sm ${mode === "sign-in" ? "border-primary font-medium" : "border-transparent text-muted-foreground"}`}
              onClick={() => {
                setMode("sign-in")
                setError("")
                setMessage("")
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              className={`-mb-px border-b-2 px-1 pb-2 text-sm ${mode === "sign-up" ? "border-primary font-medium" : "border-transparent text-muted-foreground"}`}
              onClick={() => {
                setMode("sign-up")
                setError("")
                setMessage("")
              }}
            >
              Create account
            </button>
          </div>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            {mode === "sign-up" && (
              <label className="flex flex-col gap-1.5 text-sm">
                Name
                <input
                  autoComplete="name"
                  className="h-9 rounded-md border bg-background px-3"
                  onChange={(event) => setName(event.target.value)}
                  required
                  value={name}
                />
              </label>
            )}
            <label className="flex flex-col gap-1.5 text-sm">
              Email
              <input
                autoComplete="email"
                className="h-9 rounded-md border bg-background px-3"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              Password
              <input
                autoComplete={
                  mode === "sign-up" ? "new-password" : "current-password"
                }
                className="h-9 rounded-md border bg-background px-3"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            <Button disabled={pending} type="submit">
              {pending
                ? "Please wait…"
                : mode === "sign-up"
                  ? "Create account"
                  : "Sign in"}
            </Button>
          </form>
        </>
      )}
      {message && (
        <p aria-live="polite" className="mt-4 text-sm text-muted-foreground">
          {message}
        </p>
      )}
      {error && (
        <p aria-live="assertive" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}
