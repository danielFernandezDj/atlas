"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Cpu,
  LoaderCircle,
  RefreshCw,
  Search,
  X,
} from "lucide-react"
import {
  inventoryKinds,
  inventoryKindLabels,
  type InventoryQuery,
  type InventoryPage,
  type InventoryMinerDetail,
} from "@/lib/miners/inventory-contracts"
import "./miner-workspace.css"

const time = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  dateStyle: "medium",
  timeStyle: "short",
})
const timestamp = (value: string) => time.format(new Date(value))

async function readInventory<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    signal,
    cache: "no-store",
    credentials: "same-origin",
  })
  const body = await response.json().catch(() => null)
  if (!response.ok)
    throw new Error(
      body?.message ?? "Miner records could not be loaded. Please try again."
    )
  if (!body)
    throw new Error(
      "The inventory response could not be read. Please try again."
    )
  return body as T
}

export function LiveMinerWorkspace({
  sites,
  initialSite,
  refreshKey,
}: {
  sites: { id: number; name: string; is_active: boolean }[]
  initialSite: number | null
  refreshKey: string
}) {
  const [draft, setDraft] = useState("")
  const [query, setQuery] = useState<InventoryQuery>({
    search: "",
    site: initialSite,
    kind: "",
    page: 1,
    pageSize: 12,
  })
  const [page, setPage] = useState<InventoryPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [refresh, setRefresh] = useState(0)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<InventoryMinerDetail | null>(null)
  const [detailError, setDetailError] = useState("")
  const [detailRefresh, setDetailRefresh] = useState(0)
  const dialog = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({
      search: query.search,
      kind: query.kind,
      page: String(query.page),
      pageSize: String(query.pageSize),
    })
    if (query.site !== null) params.set("site", String(query.site))
    readInventory<InventoryPage>(`/api/miners?${params}`, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setPage(result)
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
  }, [query, refresh, refreshKey])

  useEffect(() => {
    if (selectedId === null) return
    const controller = new AbortController()
    if (!dialog.current?.open) dialog.current?.showModal()
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    readInventory<InventoryMinerDetail>(
      `/api/miners/${selectedId}`,
      controller.signal
    )
      .then((result) => {
        if (!controller.signal.aborted) setDetail(result)
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setDetailError(
            failure instanceof Error ? failure.message : "Miner unavailable."
          )
      })
    return () => {
      controller.abort()
      document.body.style.overflow = overflow
    }
  }, [selectedId, detailRefresh])

  function closeDetail() {
    dialog.current?.close()
    setSelectedId(null)
    setDetail(null)
    setDetailError("")
    opener.current?.focus({ preventScroll: true })
  }
  function changeQuery(next: InventoryQuery) {
    closeDetail()
    setLoading(true)
    setError("")
    setQuery(next)
  }
  function search(event: FormEvent) {
    event.preventDefault()
    changeQuery({ ...query, search: draft.trim(), page: 1 })
  }
  function openMiner(id: number) {
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    setDetail(null)
    setDetailError("")
    setSelectedId(id)
  }
  function reload() {
    setLoading(true)
    setError("")
    setRefresh((value) => value + 1)
  }

  return (
    <div className="atlas-miner-workspace">
      <div className="atlas-miner-intro">
        <span>Database inventory · read only</span>
        <span>Identity, components and physical location</span>
      </div>
      <section
        className="atlas-card atlas-directory"
        aria-labelledby="miner-directory-title"
        aria-busy={loading}
      >
        <div className="atlas-section-header">
          <div>
            <h2 id="miner-directory-title">
              <Cpu size={18} aria-hidden="true" /> Miner directory
            </h2>
            <p className="atlas-muted">
              Search miner ID, serial, component serial, MAC, asset tag, model,
              company, or location.
            </p>
          </div>
          <button
            className="atlas-text-button"
            disabled={loading}
            onClick={reload}
          >
            <RefreshCw size={14} aria-hidden="true" />
            Refresh inventory
          </button>
        </div>
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
          <label>
            <span className="sr-only">Inventory site filter</span>
            <select
              aria-label="Inventory site filter"
              value={query.site ?? "all"}
              onChange={(event) =>
                changeQuery({
                  ...query,
                  site:
                    event.target.value === "all"
                      ? null
                      : Number(event.target.value),
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
          </label>
          <label>
            <span className="sr-only">Inventory location kind</span>
            <select
              aria-label="Inventory location kind"
              value={query.kind}
              onChange={(event) =>
                changeQuery({
                  ...query,
                  kind: event.target.value as InventoryQuery["kind"],
                  site: event.target.value === "UNASSIGNED" ? null : query.site,
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
          </label>
          <button type="submit" className="atlas-chip">
            Search
          </button>
        </form>
        {loading ? (
          <p className="atlas-miner-state" role="status">
            <LoaderCircle className="atlas-spin" size={20} />
            Loading miner inventory…
          </p>
        ) : error ? (
          <div className="atlas-miner-state" role="alert">
            <p>{error}</p>
            <button className="atlas-text-button" onClick={reload}>
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
                changeQuery({
                  ...query,
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
                  <tr key={miner.id}>
                    <td>
                      <button
                        className="atlas-serial-open"
                        aria-label={`View miner ${miner.identity}`}
                        onClick={() => openMiner(miner.id)}
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
                onClick={() => changeQuery({ ...query, page: page.page - 1 })}
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
                onClick={() => changeQuery({ ...query, page: page.page + 1 })}
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          </nav>
        )}
      </section>
      <dialog
        ref={dialog}
        className="atlas-dialog atlas-miner-details-dialog atlas-live-miner-detail"
        aria-labelledby="live-miner-title"
        onCancel={(event) => {
          event.preventDefault()
          closeDetail()
        }}
      >
        <div className="atlas-details-dialog-header">
          <h2 id="live-miner-title">
            {detail ? `Miner #${detail.identity}` : "Miner details"}
          </h2>
          <button
            type="button"
            aria-label="Close miner details"
            onClick={closeDetail}
          >
            <X size={20} />
          </button>
        </div>
        <div className="atlas-details-dialog-body">
          {detailError ? (
            <div className="atlas-miner-state" role="alert">
              <p>{detailError}</p>
              <button
                className="atlas-text-button"
                onClick={() => {
                  setDetailError("")
                  setDetailRefresh((value) => value + 1)
                }}
              >
                Retry miner details
              </button>
            </div>
          ) : !detail ? (
            <p className="atlas-miner-state" role="status">
              Loading miner details…
            </p>
          ) : (
            <>
              <div className="atlas-section-header">
                <p className="atlas-muted">
                  Recorded asset and component information
                </p>
                <button
                  className="atlas-text-button"
                  onClick={() => {
                    setDetail(null)
                    setDetailError("")
                    setDetailRefresh((value) => value + 1)
                  }}
                >
                  <RefreshCw size={14} />
                  Refresh miner
                </button>
              </div>
              <dl className="atlas-live-miner-fields">
                {[
                  ["Serial label", detail.serial],
                  ["Asset tag", detail.assetTag],
                  ["Model", detail.model],
                  ["Owner", detail.owner],
                  ["Managed by", detail.manager],
                  ["Current physical location", detail.location?.label],
                  ["Miner IP", detail.ip],
                  ["Last API IP", detail.lastApiIp],
                  ["Control board MAC", detail.controlBoard?.mac],
                  ["Firmware version", detail.controlBoard?.firmware],
                  [
                    "Reserved deployment slot",
                    detail.reservation
                      ? `${detail.reservation.location} · ${detail.reservation.switch} / Port ${detail.reservation.port}`
                      : null,
                  ],
                  ["Created", timestamp(detail.createdAt)],
                  ["Updated", timestamp(detail.updatedAt)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value ?? "Not recorded"}</dd>
                  </div>
                ))}
              </dl>
              <section className="atlas-live-miner-section">
                <h3>Installed components</h3>
                <div className="atlas-table-scroll">
                  <table className="atlas-miner-table">
                    <thead>
                      <tr>
                        <th>Part / position</th>
                        <th>Component ID</th>
                        <th>Serial number</th>
                        <th>Condition</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: "Skeleton", part: detail.skeleton },
                        { label: "Control board", part: detail.controlBoard },
                        ...[1, 2, 3].map((position) => ({
                          label: `Hashboard ${position}`,
                          part: detail.boards.find(
                            (board) => board.position === `SLOT_${position}`
                          ),
                        })),
                      ].map(({ label, part }) => (
                        <tr key={label}>
                          <td>{label}</td>
                          <td>{part ? `#${part.id}` : "Not assigned"}</td>
                          <td>{part?.serial ?? "Not recorded"}</td>
                          <td>{part?.condition.toLowerCase() ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="atlas-muted">
                  Positions without an assignment are empty in Atlas; this does
                  not indicate a hardware fault.
                </p>
              </section>
              <section className="atlas-live-miner-section">
                <h3>Movement history · {detail.movementCount} total</h3>
                <p className="atlas-muted">Latest 20 records · Central Time</p>
                {!detail.movements.length ? (
                  <p>No movements recorded.</p>
                ) : (
                  <ol className="atlas-live-miner-events">
                    {detail.movements.map((movement) => (
                      <li key={movement.id}>
                        <strong>{movement.reason}</strong>
                        <time dateTime={movement.occurredAt}>
                          {timestamp(movement.occurredAt)}
                        </time>
                        <p>
                          {movement.from} → {movement.to}
                        </p>
                        <p>Recorded by {movement.by}</p>
                        {movement.notes && <p>{movement.notes}</p>}
                      </li>
                    ))}
                  </ol>
                )}
              </section>
              <section className="atlas-live-miner-section">
                <h3>Component and asset history · {detail.eventCount} total</h3>
                <p className="atlas-muted">Latest 20 entries · Central Time</p>
                {!detail.events.length ? (
                  <p>No asset history recorded.</p>
                ) : (
                  <ol className="atlas-live-miner-events">
                    {detail.events.map((event) => (
                      <li key={event.id}>
                        <strong>{event.kind}</strong>
                        <time dateTime={event.occurredAt}>
                          {timestamp(event.occurredAt)}
                        </time>
                        {event.component && <p>{event.component}</p>}
                        <p>Recorded by {event.by}</p>
                        {event.notes && <p>{event.notes}</p>}
                      </li>
                    ))}
                  </ol>
                )}
              </section>
              <p className="atlas-inline-notice">
                Live hash rate, temperature, and online status are not
                connected. Inventory condition is not a live health reading.
              </p>
            </>
          )}
        </div>
      </dialog>
    </div>
  )
}
