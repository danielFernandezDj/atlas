"use client"
import { useEffect, useState } from "react"
import { LogOut, RefreshCw, UserRound, X } from "lucide-react"
import { Popover } from "@base-ui/react/popover"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth/client"
import "./inventory-actions.css"
type AccountData = {
  user: { name: string; email: string; role: string }
  total: number
  page: number
  entries: {
    id: number
    action: string
    entity_type: string
    entity_id: number
    created_at: string
  }[]
}
export function AccountMenu({
  viewer,
}: {
  viewer: { name: string; role: string }
}) {
  const [open, setOpen] = useState(false),
    [page, setPage] = useState(1),
    [retry, setRetry] = useState(0),
    [data, setData] = useState<AccountData | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false)
  const router = useRouter()
  useEffect(() => {
    if (!open) return
    const c = new AbortController()
    fetch(`/api/account-activity?page=${page}`, {
      signal: c.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        const b = await r.json()
        if (!r.ok) throw new Error(b.message)
        if (!c.signal.aborted) {
          setData(b)
          setError("")
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
    return () => c.abort()
  }, [open, page, retry])
  async function signOut() {
    setBusy(true)
    setError("")
    try {
      const result = await authClient.signOut()
      if (result.error)
        throw new Error(result.error.message ?? "Sign out failed.")
      router.replace("/")
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign out failed.")
      setBusy(false)
    }
  }
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger aria-label="Account" title={viewer.name}>
        <UserRound />
        <span>Account</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="right"
          align="end"
          sideOffset={12}
          className="atlas-account-positioner"
        >
          <Popover.Popup className="atlas-account-popover">
            <div className="atlas-action-header">
              <Popover.Title>Your account</Popover.Title>
              <Popover.Close aria-label="Close account">
                <X size={18} />
              </Popover.Close>
            </div>
            <div className="atlas-account-body">
              <p className="atlas-muted">Signed in as</p>
              <strong>{data?.user.name ?? viewer.name}</strong>
              <p>{data?.user.email}</p>
              <p className="atlas-account-role">
                {data?.user.role ?? viewer.role}
              </p>
              <div className="atlas-slack-recommendation">
                <strong>Recommended: Sign in with Slack</strong>
                <p>
                  Use the company’s Slack identity for staff access. This
                  integration is planned; Atlas sign-in is currently in use.
                </p>
              </div>
              <div className="atlas-account-activity-heading">
                <h3>Your activity</h3>
                <button
                  aria-label="Refresh my activity"
                  onClick={() => {
                    setData(null)
                    setRetry((v) => v + 1)
                  }}
                >
                  <RefreshCw size={13} />
                </button>
              </div>
              {error ? (
                <p role="alert">{error}</p>
              ) : !data ? (
                <p role="status">Loading activity…</p>
              ) : (
                <>
                  <ol className="atlas-account-activity">
                    {data.entries.map((e) => (
                      <li key={e.id}>
                        <strong>
                          {e.action.replaceAll("_", " ").toLowerCase()}
                        </strong>
                        <span>
                          {e.entity_type} #{e.entity_id}
                        </span>
                        <time dateTime={e.created_at}>
                          {new Date(e.created_at).toLocaleString("en-US", {
                            timeZone: "America/Chicago",
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}{" "}
                          CT
                        </time>
                      </li>
                    ))}
                  </ol>
                  {!data.entries.length && (
                    <p>No actions recorded for your account yet.</p>
                  )}
                  <div className="atlas-action-pagination">
                    <button
                      disabled={page === 1}
                      onClick={() => {
                        setData(null)
                        setPage((v) => v - 1)
                      }}
                    >
                      Previous
                    </button>
                    <span>{data.total} entries</span>
                    <button
                      disabled={page * 15 >= data.total}
                      onClick={() => {
                        setData(null)
                        setPage((v) => v + 1)
                      }}
                    >
                      Next
                    </button>
                  </div>
                </>
              )}
              <button
                className="atlas-account-signout"
                disabled={busy}
                onClick={signOut}
              >
                <LogOut size={15} />
                {busy ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
