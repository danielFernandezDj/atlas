"use client"
/**
 * Searches /api/miners and lets action forms select an existing miner by ID.
 * Search drafts and pagination are temporary UI state; choosing a miner neither
 * places it nor saves any inventory change.
 */

import type { InventoryPage } from "@/lib/miners/inventory-contracts"
import { useEffect, useState } from "react"

export function MinerPicker({
  onSelect,
  searchOnly = false,
}: {
  onSelect: (id: number) => void
  searchOnly?: boolean
}) {
  const [searchRevision, setSearchRevision] = useState(0)
  const [draft, setDraft] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [data, setData] = useState<InventoryPage | null>(null),
    [error, setError] = useState("")
  useEffect(() => {
    if (searchOnly && searchRevision === 0) return
    const c = new AbortController()
    fetch(
      `/api/miners?${new URLSearchParams({ search: query, page: String(page), pageSize: "8" })}`,
      { signal: c.signal, cache: "no-store" }
    )
      .then(async (r) => {
        const b = await r.json()
        if (!r.ok) throw new Error(b.message)
        if (!c.signal.aborted) setData(b)
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
    return () => c.abort()
  }, [query, page, searchRevision, searchOnly])
  return (
    <section className="atlas-action-picker" aria-label="Choose a miner">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setData(null)
          setError("")
          setPage(1)
          setQuery(draft.trim())
          setSearchRevision((v) => v + 1)
        }}
      >
        <label>
          Find a miner
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={200}
            placeholder="ID, serial, component serial or MAC"
          />
        </label>
        <button className="atlas-chip">Find miners</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {searchOnly && searchRevision === 0 ? (
        <p className="atlas-muted">
          Search for an existing miner to add a placement.
        </p>
      ) : !data && !error ? (
        <p role="status">Loading miners…</p>
      ) : (
        <>
          <div className="atlas-action-results">
            {data?.items.map((m) => (
              <button key={m.id} type="button" onClick={() => onSelect(m.id)}>
                <strong>
                  #{m.identity} · {m.serial}
                </strong>
                <span>{m.location?.label ?? "Not assigned"}</span>
              </button>
            ))}
            {data && !data.items.length && <p>No matching miners.</p>}
          </div>
          {data && (
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
              <span>
                {data.total} miners · Page {page}
              </span>
              <button
                disabled={page * 8 >= data.total}
                onClick={() => {
                  setData(null)
                  setPage((v) => v + 1)
                }}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
