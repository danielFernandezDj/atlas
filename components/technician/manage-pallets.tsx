"use client"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { Search, Package, ArrowLeft } from "lucide-react"
import {
  managePalletSchema,
  type ActionOptions,
  type ManagedPallet,
  type PalletPage,
  type ManagePalletCommand,
} from "@/lib/inventory-actions/contracts"
import { RequiredMark } from "./action-fields"
export function ManagePallets({
  options,
  onBack,
  onSaved,
  onBusyChange,
}: {
  options: ActionOptions
  onBack: () => void
  onSaved: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const [search, setSearch] = useState(""),
    [site, setSite] = useState(""),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0)
  const [data, setData] = useState<PalletPage | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState("")
  const [selected, setSelected] = useState<ManagedPallet | null>(null)
  useEffect(() => {
    const c = new AbortController()
    const timer = setTimeout(() => {
      setLoading(true)
      setError("")
      fetch(
        `/api/inventory-actions?${new URLSearchParams({ resource: "pallets", search, site, page: String(page) })}`,
        { signal: c.signal, cache: "no-store" }
      )
        .then(async (r) => {
          const b = await r.json()
          if (!r.ok) throw new Error(b.message ?? "Pallets unavailable.")
          return b
        })
        .then((b) => {
          if (!c.signal.aborted) setData(b)
        })
        .catch((e) => {
          if (!c.signal.aborted) setError(e.message)
        })
        .finally(() => {
          if (!c.signal.aborted) setLoading(false)
        })
    }, 200)
    return () => {
      c.abort()
      clearTimeout(timer)
    }
  }, [search, site, page, revision])
  if (selected)
    return (
      <PalletEditor
        pallet={selected}
        onBack={() => setSelected(null)}
        onBusyChange={onBusyChange}
        onSaved={(text) => {
          setMessage(text)
          setSelected(null)
          setRevision((v) => v + 1)
          onSaved()
        }}
      />
    )
  return (
    <section className="atlas-manage-pallets">
      <button className="atlas-text-button atlas-action-back" onClick={onBack}>
        <ArrowLeft size={14} /> All actions
      </button>
      <p className="atlas-muted">
        All pallets, including archived pallets. Select one to edit its details
        or manage its status.
      </p>
      <div className="atlas-action-form atlas-pallet-filters">
        <label>
          <span>
            <Search size={13} /> Search pallets
          </span>
          <input
            value={search}
            placeholder="Name, code or site"
            maxLength={200}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
              setLoading(true)
            }}
          />
        </label>
        <label>
          <span>Site</span>
          <select
            value={site}
            onChange={(e) => {
              setSite(e.target.value)
              setPage(1)
              setLoading(true)
            }}
          >
            <option value="">All sites</option>
            {options.sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {message && (
        <p role="status" className="atlas-action-success">
          {message}
        </p>
      )}
      {error ? (
        <div role="alert" className="atlas-action-error">
          {error}{" "}
          <button onClick={() => setRevision((v) => v + 1)}>Retry</button>
        </div>
      ) : loading ? (
        <p role="status">Loading pallets…</p>
      ) : (
        <>
          <div className="atlas-pallet-list" aria-label="Pallets">
            {data?.items.length ? (
              data.items.map((p) => (
                <button
                  className="atlas-pallet-card"
                  key={p.id}
                  onClick={() => {
                    setMessage("")
                    setSelected(p)
                  }}
                >
                  <Package size={19} />
                  <span>
                    <strong>{p.name}</strong>
                    <small>
                      {p.siteName} · {p.code}
                    </small>
                  </span>
                  <span className="atlas-pallet-card-meta">
                    <strong>
                      {p.minerCount} {p.minerCount === 1 ? "miner" : "miners"}
                    </strong>
                    <small>
                      {p.active ? "Active" : "Archived"}
                      {!p.siteActive ? " · Site inactive" : ""}
                    </small>
                  </span>
                </button>
              ))
            ) : (
              <p>
                No pallets match. Create one from Quick actions or change your
                filters.
              </p>
            )}
          </div>
          <div className="atlas-action-footer">
            <button disabled={page === 1} onClick={() => setPage((v) => v - 1)}>
              Previous
            </button>
            <span>
              Page {page} · {data?.total ?? 0} pallets
            </span>
            <button
              disabled={page * 50 >= (data?.total ?? 0)}
              onClick={() => setPage((v) => v + 1)}
            >
              Next
            </button>
            <button
              className="atlas-text-button"
              onClick={() => setRevision((v) => v + 1)}
            >
              Refresh
            </button>
          </div>
        </>
      )}
    </section>
  )
}
function PalletEditor({
  pallet,
  onBack,
  onSaved,
  onBusyChange,
}: {
  pallet: ManagedPallet
  onBack: () => void
  onSaved: (message: string) => void
  onBusyChange: (busy: boolean) => void
}) {
  const [name, setName] = useState(pallet.name),
    [code, setCode] = useState(pallet.code),
    [notes, setNotes] = useState("")
  const [operation, setOperation] = useState<
      ManagePalletCommand["operation"] | null
    >(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("")
  const inFlight = useRef(false),
    receipt = useRef<{ fingerprint: string; key: string } | null>(null)
  const changed =
    name.trim() !== pallet.name || code.trim().toUpperCase() !== pallet.code
  async function save(e: FormEvent) {
    e.preventDefault()
    if (inFlight.current || !operation) return
    const payload = {
      kind: "manage-pallet",
      palletId: pallet.id,
      operation,
      name: operation === "update" ? name : pallet.name,
      code: operation === "update" ? code : pallet.code,
      notes,
      expected: { name: pallet.name, code: pallet.code, active: pallet.active },
    }
    const fingerprint = JSON.stringify(payload)
    if (receipt.current?.fingerprint !== fingerprint)
      receipt.current = { fingerprint, key: crypto.randomUUID() }
    const parsed = managePalletSchema.safeParse({
      ...payload,
      submissionKey: receipt.current!.key,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the details.")
      return
    }
    inFlight.current = true
    setBusy(true)
    onBusyChange(true)
    setError("")
    try {
      const r = await fetch("/api/inventory-actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        }),
        b = await r.json()
      if (!r.ok)
        throw new Error(
          b.message ??
            "Save could not be confirmed. Retry without changing the form."
        )
      onSaved(b.message)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save could not be confirmed.")
    } finally {
      inFlight.current = false
      setBusy(false)
      onBusyChange(false)
    }
  }
  return (
    <section>
      <button
        className="atlas-text-button atlas-action-back"
        disabled={busy}
        onClick={onBack}
      >
        <ArrowLeft size={14} /> Pallet list
      </button>
      <div className="atlas-pallet-summary">
        <strong>{pallet.name}</strong>
        <p>
          {pallet.siteName} · {pallet.code} ·{" "}
          {pallet.active ? "Active" : "Archived"}
        </p>
        <p>{pallet.minerCount} miners currently on this pallet</p>
      </div>
      <p className="atlas-muted">
        The site stays fixed to keep location history consistent. Notes are
        recorded in the activity log.
      </p>
      <form className="atlas-action-form" onSubmit={save}>
        <fieldset disabled={busy || operation !== null}>
          <label>
            <span>
              Pallet name <RequiredMark />
            </span>
            <input
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            <span>
              Pallet code <RequiredMark />
            </span>
            <input
              required
              maxLength={100}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </label>
        </fieldset>
        <label>
          <span>
            Reason / notes <RequiredMark />
          </span>
          <textarea
            required
            minLength={3}
            maxLength={2000}
            rows={3}
            value={notes}
            disabled={busy}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="atlas-action-error">
            {error}
          </p>
        )}
        {operation ? (
          <div
            className="atlas-pallet-confirm"
            role="group"
            aria-label="Confirm pallet change"
          >
            <h3>
              {operation === "update"
                ? "Save these changes?"
                : operation === "archive"
                  ? "Archive this pallet?"
                  : operation === "restore"
                    ? "Restore this pallet?"
                    : "Permanently delete this pallet?"}
            </h3>
            <p>
              {operation === "delete"
                ? "This removes an unused pallet and cannot be undone. An activity record will remain."
                : operation === "archive"
                  ? "The pallet will disappear from location selectors. Its history will remain and it can be restored."
                  : operation === "restore"
                    ? "This pallet will become available in location selectors again."
                    : `${name.trim()} · ${code.trim().toUpperCase()}`}
            </p>
            <div className="atlas-action-footer">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setOperation(null)
                  setError("")
                }}
              >
                Cancel
              </button>
              <button
                className={
                  operation === "delete"
                    ? "atlas-pallet-danger"
                    : "atlas-action-primary"
                }
                disabled={busy}
              >
                {busy
                  ? "Saving…"
                  : operation === "delete"
                    ? "Yes, delete permanently"
                    : "Confirm"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="atlas-action-footer">
              <button
                type="button"
                className="atlas-action-primary"
                disabled={!changed}
                onClick={() => setOperation("update")}
              >
                Review changes
              </button>
              {pallet.active ? (
                <button
                  type="button"
                  disabled={pallet.minerCount > 0 || changed}
                  onClick={() => setOperation("archive")}
                >
                  Archive pallet
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!pallet.siteActive || changed}
                  onClick={() => setOperation("restore")}
                >
                  Restore pallet
                </button>
              )}
              <button
                type="button"
                className="atlas-pallet-danger"
                disabled={pallet.used || changed}
                onClick={() => setOperation("delete")}
              >
                Delete unused pallet
              </button>
            </div>
            <p className="atlas-muted">
              {pallet.minerCount > 0
                ? "Move all miners off this pallet before archiving it."
                : pallet.used
                  ? "This pallet has been used. Archive it to preserve its history."
                  : "This pallet has never been used and can be permanently deleted."}
              {changed
                ? " Save or discard your edits before changing pallet status."
                : ""}
            </p>
          </>
        )}
      </form>
    </section>
  )
}
