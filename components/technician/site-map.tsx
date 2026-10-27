"use client"

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react"
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ChevronRight,
  Copy,
  Cpu,
  Info,
  LoaderCircle,
  RefreshCw,
  Search,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  kindLabels,
  locationPath,
  modelLabel,
  type Miner,
  type MinerService,
  type Page,
} from "@/lib/miners/contracts"
import {
  buildCells,
  countCells,
  mapAddress,
  mapWarnings,
  stateLabels,
  type CanMapDetail,
  type CanSummary,
  type MapContext,
  type SiteMapOverview,
  type SiteMapService,
  type SlotCell,
  type SlotState,
} from "@/lib/site-map/model"
import "./site-map.css"

type MapSource = SiteMapService & Pick<MinerService, "searchMiners">
type Selection = { row: number; slot: number } | { sharedId: number }
const glyph: Record<SlotState, string> = {
  occupied: "M",
  empty: "+",
  inactive: "×",
  "not-configured": "·",
  unknown: "?",
  conflict: "!",
}
function CopySerial({ serial }: { serial: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <div className="atlas-map-serial">
      <strong>{serial}</strong>
      <button
        aria-label={`Copy map miner serial ${serial}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(serial)
            setCopied(true)
          } catch {
            setCopied(false)
          }
        }}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
      <span role="status" className="sr-only">
        {copied ? "Full serial copied" : ""}
      </span>
    </div>
  )
}
export function SiteMap({
  scope,
  service,
  onInspect,
}: {
  scope: { id: number; name: string }
  service: MapSource
  onInspect: (serial: string) => void
}) {
  const [overview, setOverview] = useState<SiteMapOverview | null>(null)
  const [overviewError, setOverviewError] = useState("")
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [context, setContext] = useState<MapContext | null>(null)
  const [detail, setDetail] = useState<CanMapDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState("")
  const [detailRefresh, setDetailRefresh] = useState(0)
  const [filter, setFilter] = useState<SlotState | "all">("all")
  const [selection, setSelection] = useState<Selection | null>(null)
  const [focusCell, setFocusCell] = useState({ row: 0, slot: 0 })
  const [searchTarget, setSearchTarget] = useState<{
    canId: number
    row: number
    slot: number
  } | null>(null)
  const [draft, setDraft] = useState("")
  const [searchQuery, setSearchQuery] = useState<{
    text: string
    page: number
  } | null>(null)
  const [results, setResults] = useState<Page<Miner> | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState("")
  const drawer = useRef<HTMLDialogElement>(null)
  const grid = useRef<HTMLTableElement>(null)
  const cells = useMemo(
    () =>
      context
        ? buildCells(context, detail?.locations ?? null, detail?.miners ?? [])
        : [],
    [context, detail]
  )
  const counts = useMemo(() => countCells(cells), [cells])
  const selectedCell =
    selection && "row" in selection
      ? cells.find(
          (cell) => cell.row === selection.row && cell.slot === selection.slot
        )
      : null
  const sharedLocation =
    selection && "sharedId" in selection
      ? detail?.locations.find((location) => location.id === selection.sharedId)
      : null
  const selectedMiners =
    selectedCell?.miners ??
    (sharedLocation
      ? (detail?.miners.filter(
          (miner) => miner.current_location?.id === sharedLocation.id
        ) ?? [])
      : [])
  const selectedAddress =
    context && selectedCell
      ? mapAddress(context, selectedCell.row, selectedCell.slot)
      : sharedLocation
        ? locationPath(sharedLocation)
        : "Location details"
  useEffect(() => {
    const controller = new AbortController()
    service
      .getSiteMapOverview(scope.id, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setOverview(value)
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setOverviewError(
            failure instanceof Error
              ? failure.message
              : "Site configuration could not be loaded."
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setOverviewLoading(false)
      })
    return () => controller.abort()
  }, [service, scope.id, refresh])
  useEffect(() => {
    if (!context) return
    const controller = new AbortController()
    service
      .getCanMap(context.can.id, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setDetail(value)
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setDetailError(
            failure instanceof Error
              ? failure.message
              : "Slot data could not be loaded."
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false)
      })
    return () => controller.abort()
  }, [service, context, detailRefresh])
  useEffect(() => {
    if (!searchQuery) return
    const controller = new AbortController()
    service
      .searchMiners(
        {
          search: searchQuery.text,
          site_id: scope.id,
          kind: "",
          page: searchQuery.page,
          page_size: 6,
        },
        controller.signal
      )
      .then((value) => {
        if (!controller.signal.aborted) setResults(value)
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setSearchError(
            failure instanceof Error
              ? failure.message
              : "Search could not be completed."
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setSearchLoading(false)
      })
    return () => controller.abort()
  }, [service, scope.id, searchQuery])
  useEffect(() => {
    const element = drawer.current
    if (selection && !element?.open) element?.showModal()
    else if (!selection && element?.open) element.close()
  }, [selection])
  useEffect(() => {
    if (
      !searchTarget ||
      detailLoading ||
      searchTarget.canId !== context?.can.id
    )
      return
    const cell = grid.current?.querySelector<HTMLButtonElement>(
      `[data-coordinate="${searchTarget.row}-${searchTarget.slot}"]`
    )
    cell?.focus()
    cell?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [searchTarget, detailLoading, context?.can.id])
  function openCan(next: MapContext, target?: { row: number; slot: number }) {
    setContext(next)
    setDetail(null)
    setDetailLoading(true)
    setDetailError("")
    setSelection(null)
    setFilter("all")
    setFocusCell(target ?? { row: 0, slot: 0 })
    setSearchTarget(target ? { canId: next.can.id, ...target } : null)
  }
  function backToOverview() {
    setContext(null)
    setDetail(null)
    setSelection(null)
    setSearchTarget(null)
    setFilter("all")
  }
  function reloadOverview() {
    setOverviewLoading(true)
    setOverviewError("")
    setRefresh((value) => value + 1)
  }
  function reloadCan() {
    setDetail(null)
    setDetailLoading(true)
    setDetailError("")
    setDetailRefresh((value) => value + 1)
  }
  function search(event: FormEvent) {
    event.preventDefault()
    if (!draft.trim()) return
    setSearchLoading(true)
    setSearchError("")
    setResults(null)
    setSearchQuery({ text: draft.trim(), page: 1 })
  }
  function locate(miner: Miner) {
    const location = miner.current_location
    if (!location) {
      onInspect(miner.serial_number)
      return
    }
    if (location.site_id !== scope.id) {
      setSearchError(
        "This result is outside the selected site. Choose its site in the workspace header."
      )
      return
    }
    if (!location.building) {
      setSearchError(
        "The building relation is unavailable. Open the miner record to review this location."
      )
      return
    }
    const next = {
      site: location.site,
      building: location.building,
      can: location.can,
    }
    if (
      location.kind === "DEPLOYMENT_SLOT" &&
      location.row_index !== null &&
      location.slot_index !== null &&
      location.row_index >= 0 &&
      location.slot_index >= 0 &&
      location.row_index < location.can.row_count &&
      location.slot_index < location.can.slot_per_row
    )
      openCan(next, { row: location.row_index, slot: location.slot_index })
    else if (location.kind !== "DEPLOYMENT_SLOT") openCan(next)
    else {
      setSearchError(
        "This deployment record has no valid grid address. Open the miner record for details."
      )
      return
    }
  }
  function handleGridKey(
    event: KeyboardEvent<HTMLButtonElement>,
    cell: SlotCell
  ) {
    let row = cell.row,
      slot = cell.slot
    if (event.key === "ArrowLeft") slot--
    else if (event.key === "ArrowRight") slot++
    else if (event.key === "ArrowUp") row--
    else if (event.key === "ArrowDown") row++
    else if (event.key === "Home") {
      slot = 0
      if (event.ctrlKey) row = 0
    } else if (event.key === "End") {
      slot = context!.can.slot_per_row - 1
      if (event.ctrlKey) row = context!.can.row_count - 1
    } else return
    event.preventDefault()
    row = Math.max(0, Math.min(context!.can.row_count - 1, row))
    slot = Math.max(0, Math.min(context!.can.slot_per_row - 1, slot))
    setFocusCell({ row, slot })
    grid.current
      ?.querySelector<HTMLButtonElement>(`[data-coordinate="${row}-${slot}"]`)
      ?.focus()
  }
  const sharedLocations =
    detail?.locations.filter(
      (location) => location.kind !== "DEPLOYMENT_SLOT"
    ) ?? []
  const warnings =
    context && detail ? mapWarnings(context, detail.locations) : []
  return (
    <div className="atlas-site-map">
      <div className="atlas-map-notice">
        <Info size={16} />
        <div>
          <strong>Demo physical placement map · read-only</strong>
          <p>
            Uses the same synthetic miners and locations as the Miner workspace.
            No per-miner telemetry is available; occupied slots do not imply
            healthy or hashing miners.
          </p>
        </div>
      </div>
      <section className="atlas-card atlas-map-search">
        <div>
          <h2>
            <Search size={16} />
            Find a miner on the map
          </h2>
          <p>
            Serial or asset tag · all registered locations in {scope.name}, not
            just the visible can. Unassigned miners are outside this site’s
            search scope.
          </p>
        </div>
        <form onSubmit={search}>
          <label className="sr-only" htmlFor="site-map-search">
            Search site map by serial or asset tag
          </label>
          <input
            id="site-map-search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="e.g. ATLAS-1001 or ASSET-204"
            autoComplete="off"
          />
          <Button
            type="submit"
            className="min-h-10 rounded-md px-4"
            disabled={searchLoading || !draft.trim()}
          >
            {searchLoading ? (
              <LoaderCircle size={15} className="atlas-spin" />
            ) : (
              <Search size={15} />
            )}
            Find
          </Button>
          {(results || searchError) && (
            <button
              type="button"
              className="atlas-text-button"
              onClick={() => {
                setResults(null)
                setSearchQuery(null)
                setSearchError("")
                setSearchLoading(false)
                setDraft("")
                setSearchTarget(null)
              }}
            >
              Clear
            </button>
          )}
        </form>
        {searchError && (
          <p role="alert" className="atlas-map-error">
            {searchError}
          </p>
        )}
        {results && (
          <div className="atlas-map-results">
            <p role="status">
              {results.total} matching miner{results.total === 1 ? "" : "s"} in{" "}
              {scope.name}
            </p>
            {!results.items.length ? (
              <p>
                No matching miner at this site. Check the identifier or choose
                another site in the header.
              </p>
            ) : (
              <ul>
                {results.items.map((miner) => (
                  <li key={miner.id}>
                    <div>
                      <strong>{miner.serial_number}</strong>
                      <span>{miner.asset_tag ?? "Asset tag not assigned"}</span>
                      <p>{locationPath(miner.current_location)}</p>
                    </div>
                    <div>
                      <button
                        className="atlas-text-button"
                        onClick={() => locate(miner)}
                      >
                        {miner.current_location?.kind === "DEPLOYMENT_SLOT"
                          ? "Locate slot"
                          : "Open can"}
                        <ArrowRight size={13} />
                      </button>
                      <button
                        className="atlas-text-button"
                        onClick={() => onInspect(miner.serial_number)}
                      >
                        Miner record
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {results.total > results.page_size && (
              <div className="atlas-map-pagination">
                <button
                  disabled={searchLoading || results.page === 1}
                  onClick={() => {
                    setSearchLoading(true)
                    setSearchQuery({
                      text: searchQuery!.text,
                      page: results.page - 1,
                    })
                  }}
                >
                  Previous results
                </button>
                <span>Page {results.page}</span>
                <button
                  disabled={
                    searchLoading ||
                    results.page * results.page_size >= results.total
                  }
                  onClick={() => {
                    setSearchLoading(true)
                    setSearchQuery({
                      text: searchQuery!.text,
                      page: results.page + 1,
                    })
                  }}
                >
                  Next results
                </button>
              </div>
            )}
          </div>
        )}
      </section>
      {context ? (
        <>
          <div className="atlas-map-detail-toolbar">
            <button className="atlas-text-button" onClick={backToOverview}>
              <ArrowLeft size={14} />
              Site overview
            </button>
            <div>
              <label>
                Building
                <select
                  aria-label="Map building"
                  value={context.building.id}
                  onChange={(event) => {
                    const next = overview?.buildings.find(
                      (item) => item.building.id === Number(event.target.value)
                    )
                    if (next?.cans[0])
                      openCan({
                        site: overview!.site,
                        building: next.building,
                        can: next.cans[0].can,
                      })
                  }}
                >
                  {overview?.buildings.map((item) => (
                    <option key={item.building.id} value={item.building.id}>
                      B{item.building.building_number}
                      {!item.building.is_active ? " · Inactive" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Can
                <select
                  aria-label="Map can"
                  value={context.can.id}
                  onChange={(event) => {
                    const next = overview?.buildings
                      .find((item) => item.building.id === context.building.id)
                      ?.cans.find(
                        (item) => item.can.id === Number(event.target.value)
                      )
                    if (next) openCan({ ...context, can: next.can })
                  }}
                >
                  {overview?.buildings
                    .find((item) => item.building.id === context.building.id)
                    ?.cans.map((item) => (
                      <option key={item.can.id} value={item.can.id}>
                        Can {item.can.can_number}
                        {!item.can.is_active ? " · Inactive" : ""}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          </div>
          <section className="atlas-card atlas-map-can-detail">
            <div className="atlas-map-can-header">
              <div>
                <p className="atlas-eyebrow">
                  {scope.name} / B{context.building.building_number} / Can{" "}
                  {context.can.can_number}
                </p>
                <h2>Physical slot grid</h2>
                <p>
                  {context.can.row_count} rows × {context.can.slot_per_row}{" "}
                  slots · {cells.length} fixed positions · zero-based
                  coordinates
                </p>
              </div>
              <button
                className="atlas-map-icon-button"
                aria-label="Refresh can map"
                onClick={reloadCan}
                disabled={detailLoading}
              >
                <RefreshCw size={17} />
              </button>
            </div>
            {(!context.site.is_active ||
              !context.building.is_active ||
              !context.can.is_active) && (
              <p className="atlas-map-availability-note">
                This can or its hierarchy is inactive. Existing assignments
                remain readable; configured slots are unavailable.
              </p>
            )}
            <div className="atlas-map-legend">
              {(Object.keys(stateLabels) as SlotState[]).map((state) => (
                <span key={state}>
                  <i className={`atlas-map-state-${state}`}>{glyph[state]}</i>
                  {stateLabels[state]} <strong>{counts[state]}</strong>
                </span>
              ))}
            </div>
            <div className="atlas-map-filter">
              <label>
                Highlight physical state
                <select
                  aria-label="Map physical state filter"
                  value={filter}
                  onChange={(event) =>
                    setFilter(event.target.value as SlotState | "all")
                  }
                >
                  <option value="all">All states</option>
                  {(Object.keys(stateLabels) as SlotState[]).map((state) => (
                    <option key={state} value={state}>
                      {stateLabels[state]}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                {filter === "all"
                  ? `${cells.length} positions shown`
                  : `${counts[filter]} matching positions · other cells are dimmed, not removed`}
                . Arrow keys move between cells; Enter or Space opens the
                inspector.
              </p>
            </div>
            {detailLoading && (
              <p className="atlas-map-load-state" role="status">
                <LoaderCircle size={14} className="atlas-spin" />
                Loading slot assignments. Availability is unknown until the read
                completes.
              </p>
            )}
            {detailError && (
              <div role="alert" className="atlas-map-error">
                <p>{detailError} Slot availability is unknown.</p>
                <button className="atlas-text-button" onClick={reloadCan}>
                  Retry slot data
                </button>
              </div>
            )}
            {warnings.map((warning) => (
              <p className="atlas-map-error" key={warning}>
                {warning}
              </p>
            ))}
            <div
              className="atlas-map-viewport"
              aria-label="Scrollable physical slot map"
            >
              <table
                ref={grid}
                className="atlas-slot-grid"
                role="grid"
                aria-label={`${scope.name} / B${context.building.building_number} / Can ${context.can.can_number} deployment positions`}
              >
                <thead>
                  <tr>
                    <th scope="col" className="atlas-grid-origin">
                      Row / Slot
                    </th>
                    {Array.from(
                      { length: context.can.slot_per_row },
                      (_, slot) => (
                        <th scope="col" key={slot}>
                          {slot}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: context.can.row_count }, (_, row) => (
                    <tr key={row}>
                      <th scope="row">{row}</th>
                      {cells
                        .slice(
                          row * context.can.slot_per_row,
                          (row + 1) * context.can.slot_per_row
                        )
                        .map((cell) => {
                          const selected = Boolean(
                              selection &&
                              "row" in selection &&
                              selection.row === row &&
                              selection.slot === cell.slot
                            ),
                            found =
                              searchTarget?.canId === context.can.id &&
                              searchTarget.row === row &&
                              searchTarget.slot === cell.slot
                          const description = `${mapAddress(context, row, cell.slot)}. ${stateLabels[cell.state]}.${cell.miners.length ? ` ${cell.miners.map((miner) => miner.serial_number).join(", ")}. Telemetry unavailable.` : ""}`
                          return (
                            <td key={cell.slot}>
                              <button
                                type="button"
                                data-coordinate={`${row}-${cell.slot}`}
                                data-state={cell.state}
                                data-search-match={found ? "true" : undefined}
                                className={`atlas-map-cell atlas-map-state-${cell.state} ${filter !== "all" && filter !== cell.state ? "atlas-map-dimmed" : ""} ${selected ? "atlas-map-cell-selected" : ""} ${found ? "atlas-map-cell-found" : ""}`}
                                aria-label={description}
                                aria-pressed={selected}
                                title={description}
                                tabIndex={
                                  focusCell.row === row &&
                                  focusCell.slot === cell.slot
                                    ? 0
                                    : -1
                                }
                                onFocus={() =>
                                  setFocusCell({ row, slot: cell.slot })
                                }
                                onKeyDown={(event) =>
                                  handleGridKey(event, cell)
                                }
                                onClick={() =>
                                  setSelection({ row, slot: cell.slot })
                                }
                              >
                                <span aria-hidden="true">
                                  {glyph[cell.state]}
                                </span>
                                <code>
                                  {row}-{cell.slot}
                                </code>
                              </button>
                            </td>
                          )
                        })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="atlas-map-grid-note">
              Rows increase top to bottom; slots increase left to right. Missing
              location records are not configured positions, never confirmed
              empty slots. Counts use the visible map states; inspect inactive
              positions to see any existing occupants.
            </p>
          </section>
          {detail && (
            <section className="atlas-card atlas-map-shared">
              <div>
                <h2>Shared physical destinations</h2>
                <p>
                  Pallets, staging, and repair areas can hold multiple miners.
                  They are not rack cells.
                </p>
              </div>
              <div className="atlas-map-shared-cards">
                {sharedLocations.map((location) => {
                  const assigned = detail.miners.filter(
                    (miner) => miner.current_location?.id === location.id
                  )
                  return (
                    <button
                      key={location.id}
                      onClick={() => setSelection({ sharedId: location.id })}
                    >
                      <span>{kindLabels[location.kind]}</span>
                      <strong>{location.name}</strong>
                      <code>{location.code}</code>
                      <span>
                        {assigned.length} miner
                        {assigned.length === 1 ? "" : "s"}
                        <ChevronRight size={14} />
                      </span>
                    </button>
                  )
                })}
                {!sharedLocations.length && (
                  <p>No shared location records in this can.</p>
                )}
              </div>
            </section>
          )}
        </>
      ) : overviewLoading ? (
        <div className="atlas-card atlas-map-loading" role="status">
          <LoaderCircle size={22} className="atlas-spin" />
          <p>Loading {scope.name} placement configuration…</p>
        </div>
      ) : overviewError ? (
        <div className="atlas-card atlas-map-loading" role="alert">
          <p>{overviewError}</p>
          <button className="atlas-text-button" onClick={reloadOverview}>
            Retry site configuration
          </button>
        </div>
      ) : overview ? (
        <>
          <div className="atlas-map-overview-heading">
            <div>
              <h2>{scope.name} · site overview</h2>
              <p>
                Schematic grouping by building, not verified building geography.
                Can dimensions come from the existing configuration.
              </p>
            </div>
            <button
              aria-label="Refresh site map overview"
              className="atlas-map-icon-button"
              onClick={reloadOverview}
            >
              <RefreshCw size={17} />
            </button>
          </div>
          {overview.buildings.map(({ building, cans }) => (
            <section className="atlas-map-building" key={building.id}>
              <div>
                <h3>
                  <Building2 size={18} />
                  Building {building.building_number}
                </h3>
                <span>
                  {cans.length} cans
                  {!building.is_active ? " · Inactive building" : ""}
                </span>
              </div>
              <div className="atlas-map-can-cards">
                {cans.map((item) => (
                  <CanCard
                    key={item.can.id}
                    item={item}
                    parentActive={building.is_active && overview.site.is_active}
                    onOpen={() =>
                      openCan({ site: overview.site, building, can: item.can })
                    }
                  />
                ))}
              </div>
              {!cans.length && <p>No cans configured for this building.</p>}
            </section>
          ))}
          {!overview.buildings.length && (
            <p className="atlas-map-loading">
              No buildings configured at this site.
            </p>
          )}
          <p className="atlas-map-reference">
            SOP reference standard: 11 rows (0–10) × 35 slots (0–34), 385
            positions. This demo retains its own existing can dimensions and
            synthetic site names; no reference configuration has been applied to
            inventory.
          </p>
        </>
      ) : null}
      <dialog
        ref={drawer}
        className="atlas-map-inspector"
        aria-labelledby="map-inspector-title"
        onCancel={() => setSelection(null)}
        onClose={() => setSelection(null)}
      >
        <header>
          <div>
            <p className="atlas-eyebrow">PHYSICAL LOCATION · READ-ONLY</p>
            <h2 id="map-inspector-title">
              {sharedLocation
                ? kindLabels[sharedLocation.kind]
                : selectedCell
                  ? `${selectedCell.row}-${selectedCell.slot}`
                  : "Slot inspector"}
            </h2>
          </div>
          <button
            aria-label="Close slot inspector"
            onClick={() => setSelection(null)}
          >
            <X size={20} />
          </button>
        </header>
        <div className="atlas-map-inspector-body">
          <p className="atlas-map-full-address">{selectedAddress}</p>
          {selectedCell && (
            <span
              className={`atlas-map-inspector-state atlas-map-state-${selectedCell.state}`}
            >
              {stateLabels[selectedCell.state]}
            </span>
          )}
          {selectedCell?.state === "unknown" && (
            <p className="atlas-map-inspector-message">
              {detailLoading
                ? "Slot data is still loading."
                : "The slot read failed or has not completed."}{" "}
              Occupancy and availability cannot be confirmed.
            </p>
          )}
          {selectedCell?.state === "not-configured" && (
            <p className="atlas-map-inspector-message">
              No deployment location record exists at this coordinate. This is
              not a confirmed empty slot and cannot be used as a destination.
            </p>
          )}
          {selectedCell?.state === "inactive" && (
            <p className="atlas-map-inspector-message">
              This location or its site/building/can is inactive. It is
              unavailable for new placements. This does not mean an assigned
              miner is disabled.
            </p>
          )}
          {selectedCell?.state === "conflict" && (
            <p className="atlas-map-conflict-note">
              Conflicting placement data:{" "}
              {selectedCell.locations.length > 1
                ? "multiple location records share this coordinate"
                : "multiple miners reference this deployment slot"}
              . All reported occupants are shown; none has been selected as
              authoritative.
            </p>
          )}
          {(
            selectedCell?.locations ?? (sharedLocation ? [sharedLocation] : [])
          ).map((location) => (
            <dl className="atlas-map-location-fields" key={location.id}>
              <div>
                <dt>Location name</dt>
                <dd>{location.name}</dd>
              </div>
              <div>
                <dt>Code</dt>
                <dd>{location.code}</dd>
              </div>
              <div>
                <dt>Kind</dt>
                <dd>{kindLabels[location.kind]}</dd>
              </div>
            </dl>
          ))}
          {selectedCell?.state === "empty" && (
            <p className="atlas-map-inspector-message">
              <strong>No miner assigned.</strong> This existing active
              deployment slot is available in the current demo read.
            </p>
          )}
          {sharedLocation && !selectedMiners.length && (
            <p className="atlas-map-inspector-message">
              No miner assigned to this shared location.
            </p>
          )}
          {selectedMiners.map((miner) => (
            <article className="atlas-map-miner-card" key={miner.id}>
              <CopySerial serial={miner.serial_number} />
              <p>{modelLabel(miner)}</p>
              <dl>
                <div>
                  <dt>Asset tag</dt>
                  <dd>{miner.asset_tag ?? "Not assigned"}</dd>
                </div>
                <div>
                  <dt>Owner</dt>
                  <dd>{miner.owner.name}</dd>
                </div>
                <div>
                  <dt>Managed by</dt>
                  <dd>{miner.manager.name}</dd>
                </div>
              </dl>
              <p className="atlas-map-telemetry">
                <Cpu size={14} />
                Telemetry unavailable · physical assignment only
              </p>
              <Button
                className="min-h-10 rounded-md px-4"
                onClick={() => onInspect(miner.serial_number)}
              >
                Open miner record
                <ArrowRight size={14} />
              </Button>
            </article>
          ))}
          <p className="atlas-map-inspector-footnote">
            Browsing and selecting positions performs no writes. Use the
            existing miner record for authorized actions; this map does not
            deploy or move miners.
          </p>
        </div>
      </dialog>
    </div>
  )
}
function CanCard({
  item,
  parentActive,
  onOpen,
}: {
  item: CanSummary
  parentActive: boolean
  onOpen: () => void
}) {
  return (
    <button
      className="atlas-card atlas-map-can-card"
      onClick={onOpen}
      aria-label={`Open can ${item.can.can_number} physical map`}
    >
      <div>
        <strong>Can {item.can.can_number}</strong>
        <span>
          {item.can.is_active && parentActive
            ? "Configured can"
            : "Inactive can / hierarchy"}
        </span>
      </div>
      <p>
        {item.can.row_count} × {item.can.slot_per_row} ·{" "}
        {item.can.row_count * item.can.slot_per_row} positions
      </p>
      <dl>
        <div>
          <dt>Occupied</dt>
          <dd>{item.counts.occupied}</dd>
        </div>
        <div>
          <dt>Available</dt>
          <dd>{item.counts.empty}</dd>
        </div>
        <div>
          <dt>Unavailable</dt>
          <dd>{item.counts.inactive}</dd>
        </div>
        <div>
          <dt>Not configured</dt>
          <dd>{item.counts["not-configured"]}</dd>
        </div>
        {item.counts.conflict > 0 && (
          <div>
            <dt>Conflicts</dt>
            <dd>{item.counts.conflict}</dd>
          </div>
        )}
      </dl>
      <footer>
        <span>{item.sharedMiners} miners in shared areas</span>
        <span>
          View grid
          <ChevronRight size={13} />
        </span>
      </footer>
      {item.warnings.map((warning) => (
        <p className="atlas-map-error" key={warning}>
          {warning}
        </p>
      ))}
    </button>
  )
}
