"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Cpu,
  History,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  type MinerService,
  type Miner,
  type MinerQuery,
  type MinerDetail,
  type Movement,
  type Page,
  kindLabels,
  reasonLabels,
  locationKinds,
  locationPath,
  modelLabel,
  displayTime,
  isLocationActive,
} from "@/lib/miners/contracts"
import { MinerMoveDialog } from "./miner-move-dialog"
import "./miner-workspace.css"

const emptyPage: Page<Miner> = { items: [], total: 0, page: 1, page_size: 6 }
function CopySerial({
  serial,
  onSelect,
}: {
  serial: string
  onSelect?: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <span className="atlas-copy-serial">
      {onSelect ? (
        <button
          type="button"
          className="atlas-serial-open"
          title={serial}
          aria-label={`View miner ${serial}`}
          onClick={onSelect}
        >
          {serial}
        </button>
      ) : (
        <span title={serial}>{serial}</span>
      )}
      <button
        type="button"
        aria-label={`Copy serial ${serial}`}
        title="Copy full serial number"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(serial)
            setCopied(true)
            setFailed(false)
          } catch {
            setFailed(true)
          }
        }}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
      <span className="sr-only" role="status">
        {copied
          ? "Full serial copied"
          : failed
            ? `Copy unavailable. Full serial: ${serial}`
            : ""}
      </span>
    </span>
  )
}
function Pagination({
  page,
  total,
  pageSize,
  loading,
  onPage,
  label,
}: {
  page: number
  total: number
  pageSize: number
  loading: boolean
  onPage: (page: number) => void
  label: string
}) {
  return (
    <nav className="atlas-miner-pagination" aria-label={`${label} pagination`}>
      <span>
        {total
          ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`
          : "0 results"}
      </span>
      <div>
        <button
          aria-label={`Previous ${label} page`}
          disabled={loading || page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft size={14} />
          Previous
        </button>
        <span>
          Page {page} of {Math.max(1, Math.ceil(total / pageSize))}
        </span>
        <button
          aria-label={`Next ${label} page`}
          disabled={loading || page * pageSize >= total}
          onClick={() => onPage(page + 1)}
        >
          Next
          <ChevronRight size={14} />
        </button>
      </div>
    </nav>
  )
}

export function MinerWorkspace({
  scope,
  service,
  initialSerial,
  repair,
  onMovement,
}: {
  scope: { id: number; name: string }
  service: MinerService
  initialSerial: string
  repair: boolean
  onMovement: () => void
}) {
  const currentSiteId = scope.id
  const [draft, setDraft] = useState(initialSerial)
  const [query, setQuery] = useState<MinerQuery>({
    search: initialSerial,
    site_id: initialSerial ? null : currentSiteId,
    kind: "",
    page: 1,
    page_size: 6,
  })
  const [page, setPage] = useState(emptyPage)
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState("")
  const [listRefresh, setListRefresh] = useState(0)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<MinerDetail | null>(null)
  const [history, setHistory] = useState<Page<Movement>>({
    items: [],
    total: 0,
    page: 1,
    page_size: 5,
  })
  const [historyPage, setHistoryPage] = useState(1)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState("")
  const [detailRefresh, setDetailRefresh] = useState(0)
  const [notice, setNotice] = useState("")
  const [moveOpen, setMoveOpen] = useState(false)
  const detailDialog = useRef<HTMLDialogElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const dialog = detailDialog.current
    if (selectedId !== null && !dialog?.open) dialog?.showModal()
    else if (selectedId === null && dialog?.open) dialog.close()
  }, [selectedId])
  useEffect(() => {
    if (selectedId === null) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [selectedId])
  useEffect(() => {
    const controller = new AbortController()
    service
      .searchMiners(query, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setPage(result)
      })
      .catch((failure) => {
        if (!controller.signal.aborted) {
          setListError(
            failure instanceof Error
              ? failure.message
              : "Miner inventory could not be loaded."
          )
          setPage(emptyPage)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setListLoading(false)
      })
    return () => controller.abort()
  }, [service, query, listRefresh])
  useEffect(() => {
    if (!initialSerial) return
    const controller = new AbortController()
    service
      .searchMiners(
        {
          search: initialSerial,
          site_id: null,
          kind: "",
          page: 1,
          page_size: 6,
        },
        controller.signal
      )
      .then((result) => {
        const exact = result.items.find(
          (miner) =>
            miner.serial_number.toLocaleLowerCase() ===
            initialSerial.toLocaleLowerCase()
        )
        if (!controller.signal.aborted && exact) {
          setDetailLoading(true)
          setDetailError("")
          setDetail(null)
          setSelectedId(exact.id)
        }
      })
      .catch(() => {
        /* The directory request displays any read error and its retry action. */
      })
    return () => controller.abort()
  }, [service, initialSerial])
  useEffect(() => {
    if (selectedId === null) return
    const controller = new AbortController()
    Promise.all([
      service.getMiner(selectedId, controller.signal),
      service.getHistory(selectedId, historyPage, 5, controller.signal),
    ])
      .then(([nextDetail, nextHistory]) => {
        if (!controller.signal.aborted) {
          setDetail(nextDetail)
          setHistory(nextHistory)
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setDetailError(
            failure instanceof Error
              ? failure.message
              : "Miner details could not be loaded."
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false)
      })
    return () => controller.abort()
  }, [service, selectedId, historyPage, detailRefresh])
  function closeDetails() {
    setMoveOpen(false)
    setSelectedId(null)
    setDetail(null)
    setDetailError("")
    setDetailLoading(false)
    setNotice("")
  }
  function selectMiner(id: number) {
    openerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    setMoveOpen(false)
    setDetailLoading(true)
    setDetailError("")
    setDetail(null)
    setSelectedId(id)
    setHistoryPage(1)
    setNotice("")
    setDetailRefresh((value) => value + 1)
  }
  function updateQuery(
    next: MinerQuery | ((current: MinerQuery) => MinerQuery)
  ) {
    setListLoading(true)
    setListError("")
    setSelectedId(null)
    setDetail(null)
    setDetailError("")
    setDetailLoading(false)
    setHistoryPage(1)
    setNotice("")
    setMoveOpen(false)
    setQuery(next)
  }
  function retryList() {
    setListLoading(true)
    setListError("")
    setListRefresh((value) => value + 1)
  }
  function search(event: FormEvent) {
    event.preventDefault()
    updateQuery((current) => ({ ...current, search: draft.trim(), page: 1 }))
  }
  function refreshDetail() {
    setDetailLoading(selectedId !== null)
    setDetailError("")
    setDetail(null)
    setListLoading(true)
    setListError("")
    setHistoryPage(1)
    setDetailRefresh((value) => value + 1)
    setListRefresh((value) => value + 1)
  }
  return (
    <div className="atlas-miner-workspace">
      <div className="atlas-miner-intro">
        <div>
          <span className="atlas-miner-demo-dot" />
          <span>
            {service.mode === "demo"
              ? "Synthetic inventory · movement simulation · resets on refresh"
              : "Miner inventory"}
          </span>
        </div>
        <span>Identity, custody & physical location</span>
      </div>
      {repair && (
        <p className="atlas-inline-notice">
          Repair is a movement reason and a physical area. This view does not
          record diagnoses, repair tickets, or repair outcomes.
        </p>
      )}
      <section
        className="atlas-card atlas-directory"
        aria-labelledby="directory-title"
      >
        <div className="atlas-section-header">
          <div>
            <span className="atlas-eyebrow">INVENTORY</span>
            <h2 id="directory-title">Miner directory</h2>
            <p className="atlas-muted">
              Search serial, asset tag, model, company, or location across the
              full accessible demo inventory.
            </p>
          </div>
          <span className="atlas-directory-icon">
            <Cpu size={22} />
          </span>
        </div>
        <form className="atlas-directory-filters" onSubmit={search}>
          <label className="atlas-directory-search">
            <Search size={16} />
            <span className="sr-only">Search miner inventory</span>
            <input
              ref={searchRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Serial, asset tag, company…"
              type="search"
            />
          </label>
          <label>
            <span className="sr-only">Inventory site filter</span>
            <select
              aria-label="Inventory site filter"
              value={query.site_id ?? "all"}
              onChange={(event) =>
                updateQuery((current) => ({
                  ...current,
                  site_id:
                    event.target.value === "all"
                      ? null
                      : Number(event.target.value),
                  page: 1,
                }))
              }
            >
              <option value={currentSiteId}>{scope.name}</option>
              <option value="all">All accessible & unassigned</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Inventory location kind</span>
            <select
              aria-label="Inventory location kind"
              value={query.kind}
              onChange={(event) =>
                updateQuery((current) => ({
                  ...current,
                  kind: event.target.value as MinerQuery["kind"],
                  site_id:
                    event.target.value === "UNASSIGNED"
                      ? null
                      : current.site_id,
                  page: 1,
                }))
              }
            >
              <option value="">All location kinds</option>
              {locationKinds.map((kind) => (
                <option key={kind} value={kind}>
                  {kindLabels[kind]}
                </option>
              ))}
              <option value="UNASSIGNED">Location not assigned</option>
            </select>
          </label>
          <Button type="submit" className="min-h-10 rounded-md px-4">
            Search
          </Button>
        </form>
        <div aria-live="polite" className="atlas-directory-status">
          {listLoading ? (
            <>
              <LoaderCircle size={13} className="atlas-spin" />
              Loading miners…
            </>
          ) : listError ? (
            "Inventory unavailable"
          ) : (
            `${page.total} miner${page.total === 1 ? "" : "s"} in this view`
          )}
        </div>
        {listError ? (
          <div className="atlas-miner-state" role="alert">
            <p>{listError}</p>
            <button className="atlas-text-button" onClick={retryList}>
              Retry inventory
              <RefreshCw size={13} />
            </button>
          </div>
        ) : listLoading ? (
          <div className="atlas-directory-skeleton" aria-hidden="true">
            {[0, 1, 2].map((n) => (
              <div key={n} />
            ))}
          </div>
        ) : !page.items.length ? (
          <div className="atlas-miner-state">
            <Search size={25} />
            <h3>No miners match this view</h3>
            <p>
              Try a different search or include all accessible locations and
              unassigned miners.
            </p>
            <button
              className="atlas-text-button"
              onClick={() => {
                setDraft("")
                updateQuery({
                  ...query,
                  search: "",
                  kind: "",
                  site_id: null,
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
                  <th>Serial number / asset tag</th>
                  <th>Model</th>
                  <th>Owner</th>
                  <th>Managed by</th>
                  <th>Current location</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((miner) => (
                  <tr
                    className={selectedId === miner.id ? "is-selected" : ""}
                    key={miner.id}
                  >
                    <td>
                      <CopySerial
                        serial={miner.serial_number}
                        onSelect={() => selectMiner(miner.id)}
                      />
                      <span className="atlas-miner-cell-secondary">
                        {miner.asset_tag
                          ? `Asset tag · ${miner.asset_tag}`
                          : "Asset tag not assigned"}
                      </span>
                    </td>
                    <td>{modelLabel(miner)}</td>
                    <td>{miner.owner.name}</td>
                    <td>{miner.manager.name}</td>
                    <td>
                      <span className="atlas-location-cell">
                        {locationPath(miner.current_location)}
                      </span>
                      {miner.current_location && (
                        <span className="atlas-miner-cell-secondary">
                          {kindLabels[miner.current_location.kind]}
                          {!isLocationActive(miner.current_location)
                            ? " · Inactive location / hierarchy"
                            : ""}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!listError && (
          <Pagination
            label="inventory"
            page={query.page}
            total={page.total}
            pageSize={query.page_size}
            loading={listLoading}
            onPage={(next) => updateQuery({ ...query, page: next })}
          />
        )}
      </section>
      <dialog
        ref={detailDialog}
        className="atlas-dialog atlas-miner-details-dialog"
        aria-labelledby="selected-miner-dialog-title"
        onCancel={(event) => {
          event.preventDefault()
          if (!moveOpen) closeDetails()
        }}
        onClose={() => {
          const target = openerRef.current
          if (target?.isConnected) target.focus({ preventScroll: true })
          else searchRef.current?.focus({ preventScroll: true })
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget || moveOpen) return
          const bounds = event.currentTarget.getBoundingClientRect()
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            closeDetails()
        }}
      >
        <div className="atlas-details-dialog-header">
          <div>
            <p className="atlas-eyebrow">MINER RECORD</p>
            <h2 id="selected-miner-dialog-title">Selected miner</h2>
          </div>
          <button
            type="button"
            aria-label="Close miner details"
            onClick={closeDetails}
          >
            <X size={20} />
          </button>
        </div>
        <div className="atlas-miner-details atlas-details-dialog-body">
          {notice && (
            <div className="atlas-miner-notice" role="status">
              <ShieldCheck size={17} />
              <p>{notice}</p>
            </div>
          )}
          {detailLoading ? (
            <div className="atlas-card atlas-miner-state" role="status">
              <LoaderCircle className="atlas-spin" size={22} />
              <p>Refreshing miner details and movement history…</p>
            </div>
          ) : detailError ? (
            <div className="atlas-card atlas-miner-state" role="alert">
              <h3>Miner details unavailable</h3>
              <p>{detailError}</p>
              <button className="atlas-text-button" onClick={refreshDetail}>
                Retry miner details
                <RefreshCw size={13} />
              </button>
            </div>
          ) : !detail ? null : (
            <>
              <div className="atlas-selected-header">
                <div>
                  <h2>
                    <CopySerial serial={detail.miner.serial_number} />
                  </h2>
                  <p className="atlas-muted">{modelLabel(detail.miner)}</p>
                </div>
                <div className="atlas-selected-actions">
                  <button
                    className="atlas-refresh-miner"
                    onClick={refreshDetail}
                    aria-label="Refresh selected miner"
                  >
                    <RefreshCw size={15} />
                  </button>
                  {detail.capabilities.can_move ? (
                    <Button
                      className="min-h-11 rounded-md px-5"
                      onClick={() => setMoveOpen(true)}
                    >
                      Move miner
                      <ArrowRight size={15} />
                    </Button>
                  ) : (
                    <span className="atlas-chip">View only</span>
                  )}
                </div>
              </div>
              {!detail.capabilities.can_move && (
                <p className="atlas-permission-note">
                  {detail.capabilities.explanation ??
                    "Movement is not available for this miner."}
                </p>
              )}
              <div className="atlas-miner-detail-grid">
                <article className="atlas-card atlas-identity-card">
                  <h3>
                    <Cpu size={17} />
                    Identity & custody
                  </h3>
                  <dl>
                    <div>
                      <dt>Serial number</dt>
                      <dd className="atlas-full-serial">
                        {detail.miner.serial_number}
                      </dd>
                    </div>
                    <div>
                      <dt>Asset tag</dt>
                      <dd>{detail.miner.asset_tag ?? "Not assigned"}</dd>
                    </div>
                    <div>
                      <dt>Manufacturer</dt>
                      <dd>
                        {detail.miner.model?.manufacturer ?? "Not assigned"}
                      </dd>
                    </div>
                    <div>
                      <dt>Model</dt>
                      <dd>
                        {detail.miner.model?.name ?? "Model not assigned"}
                        {detail.miner.model?.variant
                          ? ` · ${detail.miner.model.variant}`
                          : ""}
                      </dd>
                    </div>
                    <div>
                      <dt>Owner</dt>
                      <dd>{detail.miner.owner.name}</dd>
                    </div>
                    <div>
                      <dt>Managed by</dt>
                      <dd>{detail.miner.manager.name}</dd>
                    </div>
                  </dl>
                  <footer>
                    <span>Created {displayTime(detail.miner.created_at)}</span>
                    <span>Updated {displayTime(detail.miner.updated_at)}</span>
                    <span>
                      Central Time · Record version {detail.miner.version}
                    </span>
                  </footer>
                </article>
                <article className="atlas-card atlas-location-card">
                  <h3>
                    <MapPin size={17} />
                    Current physical location
                  </h3>
                  {detail.miner.current_location ? (
                    <>
                      <span className="atlas-location-kind">
                        {kindLabels[detail.miner.current_location.kind]}
                      </span>
                      <ol className="atlas-location-path">
                        <li>
                          <span>Site</span>
                          <strong>
                            {detail.miner.current_location.site.name}
                          </strong>
                        </li>
                        <li>
                          <span>Building</span>
                          <strong>
                            {detail.miner.current_location.building
                              ? `Building ${detail.miner.current_location.building.building_number}`
                              : "Building unavailable"}
                          </strong>
                        </li>
                        <li>
                          <span>Can</span>
                          <strong>
                            {detail.miner.current_location.can.can_number}
                          </strong>
                        </li>
                        <li>
                          <span>Location</span>
                          <strong>{detail.miner.current_location.name}</strong>
                          <code>{detail.miner.current_location.code}</code>
                        </li>
                      </ol>
                      {detail.miner.current_location.kind ===
                        "DEPLOYMENT_SLOT" && (
                        <p className="atlas-coordinate-note">
                          Row{" "}
                          {detail.miner.current_location.row_index ?? "not set"}{" "}
                          · Slot{" "}
                          {detail.miner.current_location.slot_index ??
                            "not set"}
                          <span>Coordinate values shown as stored.</span>
                        </p>
                      )}
                      {!isLocationActive(detail.miner.current_location) && (
                        <p className="atlas-inactive-note">
                          This location or its hierarchy is inactive. The
                          existing assignment remains visible; inactive
                          destinations are excluded from new moves.
                        </p>
                      )}
                      {detail.miner.current_location.kind === "REPAIR" && (
                        <p className="atlas-coordinate-note">
                          A physical repair-area assignment does not indicate a
                          diagnosis or repair status.
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="atlas-unassigned">
                      <MapPin size={25} />
                      <strong>Location not assigned</strong>
                      <p>
                        This miner has no current physical location recorded.
                      </p>
                    </div>
                  )}
                </article>
              </div>
              <article className="atlas-card atlas-miner-timeline">
                <div className="atlas-section-header">
                  <div>
                    <h3>
                      <History size={17} />
                      Movement history
                    </h3>
                    <p className="atlas-muted">
                      Physical movements for this miner · Central Time
                    </p>
                  </div>
                  <span className="atlas-chip">
                    {history.total} record{history.total === 1 ? "" : "s"}
                  </span>
                </div>
                {!history.items.length ? (
                  <div className="atlas-miner-state">
                    <History size={24} />
                    <h3>No movement history yet</h3>
                    <p>Recorded movements will appear here.</p>
                  </div>
                ) : (
                  <ol>
                    {history.items.map((movement) => (
                      <li key={movement.id}>
                        <span className="atlas-timeline-dot" />
                        <div className="atlas-timeline-top">
                          <h4>{reasonLabels[movement.reason]}</h4>
                          <time dateTime={movement.occurred_at}>
                            {displayTime(movement.occurred_at)}
                          </time>
                        </div>
                        <p className="atlas-timeline-actor">
                          Recorded by {movement.recorded_by.name}
                        </p>
                        <div className="atlas-timeline-route">
                          <div>
                            <span>From</span>
                            <p>
                              {movement.from_location
                                ? locationPath(movement.from_location)
                                : "Source location not recorded"}
                            </p>
                          </div>
                          <div>
                            <span>To</span>
                            <p>{locationPath(movement.to_location)}</p>
                          </div>
                        </div>
                        {movement.notes && (
                          <p className="atlas-movement-notes">
                            {movement.notes}
                          </p>
                        )}
                        <p className="atlas-recorded-time">
                          Occurred {displayTime(movement.occurred_at)} ·
                          Recorded {displayTime(movement.recorded_at)}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
                <Pagination
                  label="movement history"
                  page={historyPage}
                  total={history.total}
                  pageSize={5}
                  loading={detailLoading}
                  onPage={(next) => {
                    setDetailLoading(true)
                    setDetailError("")
                    setDetail(null)
                    setHistoryPage(next)
                  }}
                />
              </article>
            </>
          )}
        </div>
      </dialog>
      {moveOpen && detail && (
        <MinerMoveDialog
          service={service}
          detail={detail}
          repair={repair}
          onClose={() => setMoveOpen(false)}
          onSaved={() => {
            setMoveOpen(false)
            setNotice(
              service.mode === "demo"
                ? "Demo movement recorded."
                : "Movement recorded."
            )
            refreshDetail()
            onMovement()
          }}
          onConflict={(message) => {
            setMoveOpen(false)
            setNotice(message)
            refreshDetail()
            onMovement()
          }}
        />
      )}
    </div>
  )
}
