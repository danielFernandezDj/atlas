"use client"
/**
 * Reads the paginated pallet directory from /api/inventory-actions, including archived
 * pallets. Search/site/page are temporary list state; selecting a row mounts PalletEditor,
 * which owns edits, confirmation and writes. Successful saves reload this list.
 */

import {
  type ActionOptions,
  type ManagedPallet,
  type PalletPage,
} from "@/lib/inventory-actions/contracts"
import { ArrowLeft, Package, Search } from "lucide-react"
import { useEffect, useState } from "react"
import { PalletEditor } from "./pallet-editor"
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
