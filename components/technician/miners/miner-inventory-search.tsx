"use client"
/**
 * Owns the shared miner search bar and responsive results dialog used by the
 * workspace and port actions. It reads /api/miners through miner-api.ts; selecting
 * a result calls the parent rather than modifying placement or inventory.
 */

import "@/components/technician/miners/miner-workspace.css"
import {
  inventoryKindLabels,
  inventoryKinds,
  type InventoryPage,
  type InventoryQuery,
} from "@/lib/miners/inventory-contracts"
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Search,
  X,
} from "lucide-react"
import { useEffect, useRef, useState, type FormEvent } from "react"

import { readMinerResource } from "./miner-api"
export function MinerInventorySearch({
  sites,
  initialSite,
  onSelect,
}: {
  sites: { id: number; name: string; is_active: boolean }[]
  initialSite: number | null
  onSelect: (id: number) => void
}) {
  const [draft, setDraft] = useState("")
  const [filters, setFilters] = useState<InventoryQuery>({
    search: "",
    site: initialSite,
    kind: "",
    page: 1,
    pageSize: 12,
  })
  const [query, setQuery] = useState<InventoryQuery | null>(null)
  const [page, setPage] = useState<InventoryPage | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [refresh, setRefresh] = useState(0)
  const dialog = useRef<HTMLDialogElement>(null)
  const searchButton = useRef<HTMLButtonElement>(null)
  const selection = useRef(onSelect)
  useEffect(() => {
    selection.current = onSelect
  }, [onSelect])
  useEffect(() => {
    if (!query) return
    const controller = new AbortController()
    const params = new URLSearchParams({
      search: query.search,
      kind: query.kind,
      page: String(query.page),
      pageSize: String(query.pageSize),
    })
    if (query.site !== null) params.set("site", String(query.site))
    readMinerResource<InventoryPage>(`/api/miners?${params}`, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        if (result.total === 1 && result.items.length === 1) {
          dialog.current?.close()
          setQuery(null)
          selection.current(result.items[0].id)
          searchButton.current?.focus()
        } else setPage(result)
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Inventory unavailable."
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [query, refresh])
  function changeQuery(next: InventoryQuery) {
    setLoading(true)
    setError("")
    setPage(null)
    setQuery(next)
    setRefresh((value) => value + 1)
    if (!dialog.current?.open) dialog.current?.showModal()
  }
  function search(event: FormEvent) {
    event.preventDefault()
    changeQuery({ ...filters, search: draft.trim(), page: 1 })
  }
  function closeSearch() {
    dialog.current?.close()
    setQuery(null)
    setLoading(false)
    searchButton.current?.focus()
  }
  return (
    <div className="atlas-dashboard-miner-search">
      <form className="atlas-directory-filters" onSubmit={search}>
        <label className="atlas-directory-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search miner inventory</span>
          <input
            type="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={200}
            placeholder="Miner ID, serial, MAC, company…"
          />
        </label>
        <label className="atlas-miner-search-select">
          <span className="sr-only">Inventory site filter</span>
          <select
            aria-label="Inventory site filter"
            value={filters.site ?? "all"}
            onChange={(event) =>
              setFilters({
                ...filters,
                site:
                  event.target.value === "all"
                    ? null
                    : Number(event.target.value),
                kind:
                  event.target.value !== "all" && filters.kind === "UNASSIGNED"
                    ? ""
                    : filters.kind,
                page: 1,
              })
            }
          >
            <option value="all">All sites & unassigned</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
                {!site.is_active && " · Inactive"}
              </option>
            ))}
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </label>
        <label className="atlas-miner-search-select">
          <span className="sr-only">Inventory location kind</span>
          <select
            aria-label="Inventory location kind"
            value={filters.kind}
            onChange={(event) =>
              setFilters({
                ...filters,
                kind: event.target.value as InventoryQuery["kind"],
                site: event.target.value === "UNASSIGNED" ? null : filters.site,
                page: 1,
              })
            }
          >
            <option value="">All location kinds</option>
            {inventoryKinds.map((kind) => (
              <option key={kind} value={kind}>
                {inventoryKindLabels[kind]}
              </option>
            ))}
            <option value="UNASSIGNED">Location not assigned</option>
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </label>
        <button
          ref={searchButton}
          type="submit"
          className="atlas-miner-search-submit"
        >
          <Search size={15} aria-hidden="true" />
          Search
        </button>
      </form>

      <dialog
        ref={dialog}
        className="atlas-dialog atlas-miner-search-dialog"
        aria-labelledby="miner-search-title"
        onCancel={(event) => {
          event.preventDefault()
          event.stopPropagation()
          closeSearch()
        }}
      >
        <div className="atlas-details-dialog-header">
          <div>
            <h2 id="miner-search-title">Choose a miner</h2>
            <p className="atlas-muted">
              {query?.search
                ? `Results for “${query.search}”`
                : "Results for the selected filters"}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close miner search"
            onClick={closeSearch}
          >
            <X size={20} />
          </button>
        </div>
        {loading ? (
          <p className="atlas-miner-state" role="status">
            <LoaderCircle className="atlas-spin" size={20} />
            Loading miner inventory…
          </p>
        ) : error ? (
          <div className="atlas-miner-state" role="alert">
            <p>{error}</p>
            <button
              className="atlas-text-button"
              onClick={() => changeQuery(query!)}
            >
              Retry inventory
            </button>
          </div>
        ) : !page?.items.length ? (
          <div className="atlas-miner-state">
            <h3>No miners match this view</h3>
            <p>Try another search, site, or location filter.</p>
            <button
              className="atlas-text-button"
              onClick={() => {
                setDraft("")
                setFilters({
                  ...filters,
                  search: "",
                  kind: "",
                  site: null,
                  page: 1,
                })
                changeQuery({
                  ...filters,
                  search: "",
                  kind: "",
                  site: null,
                  page: 1,
                })
              }}
            >
              Clear search and filters
            </button>
          </div>
        ) : (
          <div className="atlas-table-scroll">
            <table className="atlas-miner-table">
              <thead>
                <tr>
                  <th scope="col">Miner / serial</th>
                  <th scope="col">Model</th>
                  <th scope="col">Owner / manager</th>
                  <th scope="col">Current location</th>
                  <th scope="col">Hashboards</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((miner) => (
                  <tr
                    key={miner.id}
                    className="atlas-miner-result-row"
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest("button"))
                        return
                      closeSearch()
                      onSelect(miner.id)
                    }}
                  >
                    <td>
                      <button
                        className="atlas-serial-open"
                        aria-label={`View miner ${miner.identity}`}
                        onClick={() => {
                          closeSearch()
                          onSelect(miner.id)
                        }}
                      >
                        Miner #{miner.identity}
                      </button>
                      <span className="atlas-miner-cell-secondary">
                        {miner.serial}
                      </span>
                      <span className="atlas-miner-cell-secondary">
                        Asset tag: {miner.assetTag ?? "Not assigned"}
                      </span>
                    </td>
                    <td>{miner.model ?? "Model not assigned"}</td>
                    <td>
                      {miner.owner}
                      <span className="atlas-miner-cell-secondary">
                        Managed by {miner.manager}
                      </span>
                    </td>
                    <td>
                      <span className="atlas-location-cell">
                        {miner.location?.label ?? "Location not assigned"}
                      </span>
                      {miner.location && (
                        <span className="atlas-miner-cell-secondary">
                          {inventoryKindLabels[miner.location.kind]}
                          {!miner.location.active && " · Inactive hierarchy"}
                        </span>
                      )}
                    </td>
                    <td>{miner.hashboards} / 3 assigned</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!error && page && (
          <nav
            className="atlas-miner-pagination"
            aria-label="Miner inventory pagination"
          >
            <span role="status">
              {page.total
                ? `${(page.page - 1) * page.pageSize + 1}–${Math.min(page.page * page.pageSize, page.total)} of ${page.total} miners`
                : "0 results"}
            </span>
            <div>
              <button
                disabled={loading || page.page <= 1}
                onClick={() => changeQuery({ ...query!, page: page.page - 1 })}
              >
                <ChevronLeft size={14} />
                Previous
              </button>
              <span>
                Page {page.page} of{" "}
                {Math.max(1, Math.ceil(page.total / page.pageSize))}
              </span>
              <button
                disabled={loading || page.page * page.pageSize >= page.total}
                onClick={() => changeQuery({ ...query!, page: page.page + 1 })}
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          </nav>
        )}
      </dialog>
    </div>
  )
}
