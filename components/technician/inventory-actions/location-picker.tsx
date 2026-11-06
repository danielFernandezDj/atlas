"use client"
/**
 * Manages destination filters, pagination and selected location for move/insert forms.
 * It reads available locations from /api/inventory-actions and excludes ports already
 * in the local batch; final availability is rechecked server-side when saving.
 */

import type {
  ActionLocation,
  ActionOptions,
} from "@/lib/inventory-actions/contracts"
import { useEffect, useState } from "react"
import { LocationLabel, RequiredMark } from "./action-fields"
import { readActionResource } from "./inventory-api"

export function LocationPicker({
  options,
  initialId,
  siteId,
  onSelect,
  onChoice,
  excluded = [],
  portsOnly = false,
}: {
  onChoice?: (location: ActionLocation | null) => void
  excluded?: number[]
  portsOnly?: boolean
  options: ActionOptions
  initialId?: number
  siteId: number | null
  onSelect: (id: number | null) => void
}) {
  const [searchRevision, setSearchRevision] = useState(0)
  const [selected, setSelected] = useState<ActionLocation | null>(null),
    [site, setSite] = useState(siteId ? String(siteId) : ""),
    [kind, setKind] = useState("DEPLOYMENT_SLOT"),
    [building, setBuilding] = useState(""),
    [can, setCan] = useState(""),
    [draft, setDraft] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [error, setError] = useState("")
  const [data, setData] = useState<{
    items: ActionLocation[]
    total: number
  } | null>(null)
  useEffect(() => {
    onSelect(null)
    if (!initialId) return
    const c = new AbortController()
    readActionResource<ActionLocation>(
      { resource: "location", id: String(initialId) },
      c.signal
    )
      .then((l) => {
        if (!c.signal.aborted) {
          setSelected(l)
          onSelect(l.available ? l.id : null)
          onChoice?.(l.available ? l : null)
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
    return () => c.abort()
  }, [initialId, onSelect, onChoice])
  useEffect(() => {
    if (
      selected ||
      !site ||
      (kind === "DEPLOYMENT_SLOT" && (!building || !can))
    )
      return
    const c = new AbortController()
    readActionResource<{ items: ActionLocation[]; total: number }>(
      {
        resource: "locations",
        site,
        kind,
        building,
        can,
        search: query,
        page: String(page),
      },
      c.signal
    )
      .then((b) => {
        if (!c.signal.aborted) setData(b)
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
    return () => c.abort()
  }, [selected, site, kind, building, can, query, page, searchRevision])
  function choose(l: ActionLocation) {
    if (!l.available) return
    setSelected(l)
    onSelect(l.id)
    onChoice?.(l)
    setError("")
  }
  return (
    <section className="atlas-action-picker" aria-label="Destination location">
      <h3>
        Destination location <RequiredMark />
      </h3>
      {error && <p role="alert">{error}</p>}
      {selected ? (
        <div className="atlas-action-miner">
          <LocationLabel location={selected} />
          {!selected.available && (
            <span>This location is no longer available — choose another.</span>
          )}
          <button
            type="button"
            className="atlas-text-button"
            onClick={() => {
              setSelected(null)
              onSelect(null)
              onChoice?.(null)
              setData(null)
            }}
          >
            Choose another location
          </button>
        </div>
      ) : (
        <>
          <div className="atlas-action-fields">
            <label>
              <span>
                Site <RequiredMark />
              </span>
              <select
                required
                value={site}
                onChange={(e) => {
                  setSite(e.target.value)
                  setBuilding("")
                  setCan("")
                  setPage(1)
                  setData(null)
                }}
              >
                <option value="">Choose site</option>
                {options.sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>
                Location kind <RequiredMark />
              </span>
              <select
                required
                disabled={portsOnly}
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value)
                  setBuilding("")
                  setCan("")
                  setPage(1)
                  setData(null)
                }}
              >
                {["DEPLOYMENT_SLOT", "REPAIR", "STAGING", "PALLET"].map((k) => (
                  <option key={k} value={k}>
                    {k.replaceAll("_", " ").toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {kind === "DEPLOYMENT_SLOT" && (
            <div className="atlas-action-fields">
              <label>
                <span>
                  Building <RequiredMark />
                </span>
                <select
                  required
                  value={building}
                  disabled={!site}
                  onChange={(e) => {
                    setBuilding(e.target.value)
                    setCan("")
                    setPage(1)
                    setData(null)
                  }}
                >
                  <option value="">Choose building</option>
                  {options.sites
                    .find((s) => s.id === Number(site))
                    ?.buildings.map((b) => (
                      <option key={b.id} value={b.id}>
                        Building {b.building_number}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                <span>
                  Can <RequiredMark />
                </span>
                <select
                  required
                  value={can}
                  disabled={!building}
                  onChange={(e) => {
                    setCan(e.target.value)
                    setPage(1)
                    setData(null)
                  }}
                >
                  <option value="">Choose can</option>
                  {options.sites
                    .find((s) => s.id === Number(site))
                    ?.buildings.find((b) => b.id === Number(building))
                    ?.cans.map((c) => (
                      <option key={c.id} value={c.id}>
                        Can {c.can_number}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          )}
          <div className="atlas-action-location-search">
            <label>
              {kind === "DEPLOYMENT_SLOT"
                ? "Port index (row/column) or location code"
                : "Location name or code"}
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={200}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    setData(null)
                    setPage(1)
                    setQuery(draft.trim())
                    setSearchRevision((v) => v + 1)
                  }
                }}
              />
            </label>
            <button
              type="button"
              className="atlas-chip"
              onClick={() => {
                setData(null)
                setPage(1)
                setQuery(draft.trim())
                setSearchRevision((v) => v + 1)
              }}
            >
              Find locations
            </button>
          </div>
          {!site || (kind === "DEPLOYMENT_SLOT" && (!building || !can)) ? (
            <p className="atlas-muted">
              Choose a site
              {kind === "DEPLOYMENT_SLOT" ? ", building and can" : ""} to see
              available locations.
            </p>
          ) : !data ? (
            <p role="status">Loading available locations…</p>
          ) : (
            <>
              <div className="atlas-action-results">
                {data.items
                  .filter((l) => !excluded.includes(l.id))
                  .map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      disabled={!l.available}
                      onClick={() => choose(l)}
                    >
                      <LocationLabel location={l} />
                    </button>
                  ))}
                {!data.items.length && (
                  <p>No available locations match these filters.</p>
                )}
              </div>
              <div className="atlas-action-pagination">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => {
                    setData(null)
                    setPage((v) => v - 1)
                  }}
                >
                  Previous
                </button>
                <span>
                  {data.total} available locations · Page {page}
                </span>
                <button
                  type="button"
                  disabled={page * 20 >= data.total}
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
        </>
      )}
    </section>
  )
}
