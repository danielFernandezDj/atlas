"use client"
/**
 * Reads active scrap pallets from /api/inventory-actions with site/search pagination.
 * CreationDraftForm receives the selected location in local state. A shared pallet
 * may hold several miners; choosing it here does not create or move inventory.
 */

import type {
  ActionLocation,
  ActionOptions,
} from "@/lib/inventory-actions/contracts"
import { useEffect, useState } from "react"
import { LocationLabel, RequiredMark } from "../action-fields"
import { readRegistrationResource } from "../inventory-api"
export function PalletPicker({
  options,
  selected,
  onSelect,
}: {
  options: ActionOptions
  selected: ActionLocation | null
  onSelect: (location: ActionLocation | null) => void
}) {
  const [site, setSite] = useState("")
  const [draft, setDraft] = useState("")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [data, setData] = useState<{
    items: ActionLocation[]
    total: number
  } | null>(null)
  const [error, setError] = useState("")
  useEffect(() => {
    if (!site || selected) return
    const controller = new AbortController()
    readRegistrationResource<{ items: ActionLocation[]; total: number }>(
      {
        resource: "scrap-pallets",
        site,
        kind: "PALLET",
        search: query,
        page: String(page),
      },
      controller.signal
    )
      .then((value) => {
        if (!controller.signal.aborted) setData(value)
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
    return () => controller.abort()
  }, [site, selected, query, page, revision])
  return (
    <section className="atlas-action-picker" aria-label="Scrap pallet">
      <h3>
        Scrap pallet <RequiredMark />
      </h3>
      {selected ? (
        <div className="atlas-action-miner">
          <LocationLabel location={selected} />
          <button
            type="button"
            className="atlas-text-button"
            onClick={() => {
              onSelect(null)
              setData(null)
            }}
          >
            Choose another pallet
          </button>
        </div>
      ) : (
        <>
          <label>
            <span>
              Site <RequiredMark />
            </span>
            <select
              required
              value={site}
              onChange={(event) => {
                setSite(event.target.value)
                setPage(1)
                setData(null)
                setError("")
              }}
            >
              <option value="">Choose site</option>
              {options.sites.map((value) => (
                <option key={value.id} value={value.id}>
                  {value.name}
                </option>
              ))}
            </select>
          </label>
          <div className="atlas-action-location-search">
            <label>
              Pallet name or code
              <input
                value={draft}
                maxLength={200}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    setQuery(draft.trim())
                    setPage(1)
                    setData(null)
                    setRevision((value) => value + 1)
                  }
                }}
              />
            </label>
            <button
              type="button"
              className="atlas-chip"
              disabled={!site}
              onClick={() => {
                setQuery(draft.trim())
                setPage(1)
                setData(null)
                setRevision((value) => value + 1)
              }}
            >
              Find pallets
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
          {!site ? (
            <p className="atlas-muted">
              Choose a site to see its active pallets.
            </p>
          ) : !data ? (
            <p role="status">Loading pallets…</p>
          ) : (
            <>
              <div className="atlas-action-results">
                {data.items.map((value) => (
                  <button
                    type="button"
                    key={value.id}
                    onClick={() => onSelect(value)}
                  >
                    <LocationLabel location={value} />
                  </button>
                ))}
                {!data.items.length && (
                  <p>
                    No active pallets match. Create a pallet from Quick actions
                    before adding scrap miners.
                  </p>
                )}
              </div>
              <div className="atlas-action-pagination">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => {
                    setPage((value) => value - 1)
                    setData(null)
                  }}
                >
                  Previous
                </button>
                <span>
                  {data.total} pallets · Page {page}
                </span>
                <button
                  type="button"
                  disabled={page * 20 >= data.total}
                  onClick={() => {
                    setPage((value) => value + 1)
                    setData(null)
                  }}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </>
      )}
      <p className="atlas-muted">
        A pallet can hold several scrap miners. Only active pallets are listed.
      </p>
    </section>
  )
}
