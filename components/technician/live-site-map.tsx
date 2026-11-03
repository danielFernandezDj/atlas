"use client"
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type FocusEvent,
  type MouseEvent,
} from "react"
import { ArrowUpRight, BookOpen, LocateFixed, RefreshCw, X } from "lucide-react"
import { createPortal } from "react-dom"
import { Popover } from "@base-ui/react/popover"
import type { ActionContext } from "@/lib/inventory-actions/contracts"
import type { DashboardData } from "@/lib/dashboard/contracts"
import {
  cellDescription,
  matchesLastPort,
  type LastMapPort,
  portDisplay,
  portStates,
  type BuildingMapSummary,
  type LiveCanMap,
  type MapCell,
} from "@/lib/site-map/live-contracts"
import "./live-site-map.css"
export function LiveSiteMap({
  siteId,
  buildings,
  lastPort,
  onPortSelect,
  onAction,
  refreshKey,
  onMiner,
}: {
  siteId: number
  buildings: DashboardData["buildings"]
  lastPort: LastMapPort | null
  onPortSelect: (port: LastMapPort) => void
  onAction: (context: ActionContext) => void
  refreshKey: string
  onMiner: (id: number) => void
}) {
  const [buildingId, setBuildingId] = useState<number | null>(
    buildings.find(
      (b) =>
        b.id === lastPort?.buildingId &&
        b.cans.some((c) => c.id === lastPort.canId)
    )?.id ??
      buildings[0]?.id ??
      null
  )
  const building = buildings.find((b) => b.id === buildingId)
  const cans = [...(building?.cans ?? [])].sort((a, b) =>
    a.number.localeCompare(b.number, undefined, { numeric: true })
  )
  const [canId, setCanId] = useState<number | null>(
    cans.find((c) => c.id === lastPort?.canId)?.id ?? cans[0]?.id ?? null
  )
  const [jumpToLast, setJumpToLast] = useState(0)
  const lastPortAvailable =
    !!lastPort &&
    buildings.some(
      (b) =>
        b.id === lastPort.buildingId &&
        b.cans.some((c) => c.id === lastPort.canId)
    )
  function returnToLastPort() {
    if (!lastPort || !lastPortAvailable) return
    setBuildingId(lastPort.buildingId)
    setCanId(lastPort.canId)
    setJumpToLast((v) => v + 1)
  }
  const [refresh, setRefresh] = useState(0)
  const mapKey = `${siteId}-${canId}-${refreshKey}-${refresh}`
  const [mapResult, setMapResult] = useState<{
    key: string
    map: LiveCanMap | null
    error: string
  } | null>(null)
  useEffect(() => {
    if (canId === null) return
    const controller = new AbortController()
    fetch(`/api/site-map?site=${siteId}&can=${canId}`, {
      signal: controller.signal,
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.message ?? "Map unavailable.")
        if (!controller.signal.aborted)
          setMapResult({ key: mapKey, map: data, error: "" })
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setMapResult({
            key: mapKey,
            map: null,
            error:
              failure instanceof Error ? failure.message : "Map unavailable.",
          })
      })
    return () => controller.abort()
  }, [siteId, canId, mapKey])
  const currentMap = mapResult?.key === mapKey ? mapResult : null

  function chooseBuilding(id: number) {
    setBuildingId(id)
    const next = [...(buildings.find((b) => b.id === id)?.cans ?? [])].sort(
      (a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })
    )
    setCanId(next[0]?.id ?? null)
  }
  return (
    <div className="atlas-live-map">
      <section className="atlas-card atlas-map-selectors">
        <div className="atlas-map-choices">
          <fieldset>
            <legend>Building</legend>
            <div className="atlas-map-options atlas-map-building-options">
              {buildings.map((b) => (
                <button
                  key={b.id}
                  aria-label={`Building ${b.number}${!b.active ? " · Inactive" : ""}`}
                  aria-pressed={b.id === buildingId}
                  onClick={() => chooseBuilding(b.id)}
                >
                  <span className="atlas-map-building-full">
                    Building {b.number}
                  </span>
                  <span className="atlas-map-building-short" aria-hidden="true">
                    B{b.number}
                  </span>
                  {!b.active && <span>Inactive</span>}
                </button>
              ))}
              {!buildings.length && (
                <p>No buildings configured at this site.</p>
              )}
            </div>
          </fieldset>
          <fieldset>
            <legend>Can</legend>
            <div className="atlas-map-options atlas-map-can-options">
              {cans.map((c) => (
                <button
                  key={c.id}
                  aria-label={`Can ${c.number}${!c.active ? " · Inactive" : ""}`}
                  style={
                    /^[1-8]$/.test(c.number)
                      ? {
                          gridColumn: Math.ceil(Number(c.number) / 2),
                          gridRow: Number(c.number) % 2 ? 1 : 2,
                        }
                      : undefined
                  }
                  aria-pressed={c.id === canId}
                  onClick={() => setCanId(c.id)}
                  title={`${c.slots} configured locations${!c.active ? " · Inactive" : ""}`}
                >
                  <span className="atlas-map-can-prefix" aria-hidden="true">
                    Can{" "}
                  </span>
                  {c.number}
                  {!c.active && <span>Inactive</span>}
                </button>
              ))}
              {building && !cans.length && (
                <p>No cans configured in this building.</p>
              )}
            </div>
          </fieldset>
        </div>
        {buildingId !== null && (
          <BuildingInventory
            key={`${siteId}-${buildingId}-${refreshKey}-${refresh}`}
            siteId={siteId}
            buildingId={buildingId}
            canNumber={cans.find((c) => c.id === canId)?.number ?? null}
            canMap={currentMap?.map ?? null}
            canError={currentMap?.error ?? ""}
          />
        )}
      </section>
      {canId !== null && (
        <CanGrid
          key={mapKey}
          map={currentMap?.map ?? null}
          error={currentMap?.error ?? ""}
          lastPort={lastPort}
          jumpToLast={jumpToLast}
          lastPortAvailable={lastPortAvailable}
          onReturnToLast={returnToLastPort}
          onPortSelect={(cell) => {
            if (!building || canId === null) return
            onPortSelect({
              siteId,
              buildingId: building.id,
              buildingNumber: building.number,
              canId,
              canNumber: cans.find((c) => c.id === canId)!.number,
              row: cell.row,
              column: cell.column,
              locationId: cell.locationId,
            })
          }}
          onMiner={onMiner}
          onAction={onAction}
          onRefresh={() => setRefresh((v) => v + 1)}
        />
      )}
    </div>
  )
}
function BuildingInventory({
  siteId,
  buildingId,
  canNumber,
  canMap,
  canError,
}: {
  siteId: number
  buildingId: number
  canNumber: string | null
  canMap: LiveCanMap | null
  canError: string
}) {
  const [data, setData] = useState<BuildingMapSummary | null>(null)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/site-map/building?site=${siteId}&building=${buildingId}`, {
      signal: controller.signal,
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok)
          throw new Error(body.message ?? "Building inventory unavailable.")
        if (!controller.signal.aborted) setData(body)
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Building inventory unavailable."
          )
      })
    return () => controller.abort()
  }, [siteId, buildingId, retry])
  return (
    <section
      className="atlas-building-inventory"
      aria-label="Selected building inventory"
    >
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button
            className="atlas-text-button"
            onClick={() => {
              setError("")
              setRetry((v) => v + 1)
            }}
          >
            Retry building inventory
          </button>
        </div>
      ) : !data ? (
        <p className="atlas-muted" role="status">
          Loading building inventory…
        </p>
      ) : (
        <>
          <div className="atlas-building-summary-heading">
            <h2>Building {data.number} inventory</h2>
            <span>Database records{!data.active && " · Inactive"}</span>
          </div>
          <dl>
            {[
              ["Linked miners", data.linked],
              ["Deployed here", data.deployed],
              ["In repair", data.repair],
              ["In staging", data.staging],
              ["On pallets", data.pallet],
              ["Reserved ports", data.reserved],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {canNumber !== null && (
        <div className="atlas-selected-can-summary" role="status">
          <strong>Can {canNumber}</strong>
          {canError ? (
            <span>Map data unavailable</span>
          ) : !canMap ? (
            <span>Loading can inventory…</span>
          ) : (
            <>
              <span>
                {canMap.cells.filter((cell) => cell.locationId !== null).length}{" "}
                locations
              </span>
              <span>
                {canMap.cells.filter((cell) => cell.occupant !== null).length}{" "}
                miners present
              </span>
              <span>
                {
                  canMap.cells.filter(
                    (cell) => portDisplay(cell).state === "repair"
                  ).length
                }{" "}
                repair reservations
              </span>
              {canMap.cells.every((cell) => cell.locationId === null) && (
                <span>Not configured</span>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
function CanGrid({
  map,
  error,
  lastPort,
  jumpToLast,
  lastPortAvailable,
  onReturnToLast,
  onPortSelect,
  onMiner,
  onAction,
  onRefresh,
}: {
  map: LiveCanMap | null
  error: string
  lastPort: LastMapPort | null
  jumpToLast: number
  lastPortAvailable: boolean
  onReturnToLast: () => void
  onPortSelect: (cell: MapCell) => void
  onAction: (context: ActionContext) => void
  onMiner: (id: number) => void
  onRefresh: () => void
}) {
  const [focused, setFocused] = useState(0)
  const [hover, setHover] = useState<{
    cell: MapCell
    left: number
    top?: number
    bottom?: number
  } | null>(null)
  function inspect(
    event: MouseEvent<HTMLButtonElement> | FocusEvent<HTMLButtonElement>,
    cell: MapCell
  ) {
    const rect = event.currentTarget.getBoundingClientRect()
    setHover({
      cell,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - 292)),
      ...(rect.bottom + 160 > window.innerHeight
        ? { bottom: window.innerHeight - rect.top + 8 }
        : { top: rect.bottom + 8 }),
    })
  }
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const buttonRefs = useMemo(
    () =>
      Array.from(
        { length: map?.cells.length ?? 0 },
        (_, index) => (node: HTMLButtonElement | null) => {
          buttons.current[index] = node
        }
      ),
    [map?.cells.length]
  )
  const restoredJump = useRef<number | null>(null)
  useEffect(() => {
    if (!map || restoredJump.current === jumpToLast) return
    restoredJump.current = jumpToLast
    const index = map.cells.findIndex((cell) =>
      matchesLastPort(cell, map.id, lastPort)
    )
    if (index < 0) return
    const frame = requestAnimationFrame(() => {
      setFocused(index)
      const button = buttons.current[index]
      button?.focus({ preventScroll: true })
      button?.scrollIntoView({
        block: "nearest",
        inline: "center",
        behavior: "instant",
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [map, lastPort, jumpToLast])
  function moveFocus(event: KeyboardEvent, index: number) {
    if (!map) return
    let next = index
    const row = Math.floor(index / map.columns)
    switch (event.key) {
      case "ArrowRight":
        next = Math.min(index + 1, map.cells.length - 1)
        break
      case "ArrowLeft":
        next = Math.max(0, index - 1)
        break
      case "ArrowDown":
        next = Math.min(index + map.columns, map.cells.length - 1)
        break
      case "ArrowUp":
        next = Math.max(0, index - map.columns)
        break
      case "Home":
        next = event.ctrlKey ? 0 : row * map.columns
        break
      case "End":
        next = event.ctrlKey
          ? map.cells.length - 1
          : (row + 1) * map.columns - 1
        break
      default:
        return
    }
    event.preventDefault()
    setFocused(next)
    buttons.current[next]?.focus()
  }
  if (error)
    return (
      <section className="atlas-card atlas-map-state" role="alert">
        <p>{error}</p>
        <button onClick={onRefresh} className="atlas-text-button">
          Retry map
        </button>
      </section>
    )
  if (!map)
    return (
      <section className="atlas-card atlas-map-state" role="status">
        Loading can map…
      </section>
    )
  const counts = map.cells.reduce<Record<string, number>>((acc, cell) => {
    const state = portDisplay(cell).state
    acc[state] = (acc[state] ?? 0) + 1
    return acc
  }, {})
  return (
    <section
      className="atlas-card atlas-map-board"
      aria-label={`Building ${map.building}, Can ${map.number} port map`}
    >
      <div className="atlas-section-header">
        <div>
          <p className="atlas-eyebrow">PORT LOCATIONS</p>
          <h2>
            Building {map.building} / Can {map.number}
          </h2>
          <p className="atlas-muted">
            {map.rows} rows × {map.columns} columns · Coordinates start at 0
            {!map.active && " · Inactive hierarchy"}
          </p>
        </div>
        <div className="atlas-map-board-actions">
          <button
            className="atlas-last-port"
            type="button"
            onClick={onReturnToLast}
            disabled={!lastPortAvailable}
            aria-label={
              lastPort
                ? `Return to last port ${lastPort.row}/${lastPort.column}, Building ${lastPort.buildingNumber}, Can ${lastPort.canNumber}`
                : "Last port: none selected"
            }
            title={
              lastPort
                ? `Building ${lastPort.buildingNumber} · Can ${lastPort.canNumber} · Row ${lastPort.row} / Column ${lastPort.column}${!lastPortAvailable ? " · Can no longer available" : ""}`
                : "Click a port to keep your place"
            }
          >
            <LocateFixed size={15} aria-hidden="true" />
            <span>Last port</span>
            {lastPort ? (
              <>
                <strong>
                  {lastPort.row}/{lastPort.column}
                </strong>
                <small>
                  B{lastPort.buildingNumber} · Can {lastPort.canNumber}
                </small>
              </>
            ) : (
              <strong>—</strong>
            )}
          </button>
          <Popover.Root>
            <Popover.Trigger className="atlas-text-button">
              <BookOpen size={14} aria-hidden="true" />
              Map guide
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Positioner
                sideOffset={8}
                align="end"
                className="atlas-port-positioner"
              >
                <Popover.Popup className="atlas-map-guide">
                  <div className="atlas-port-popup-heading">
                    <Popover.Title>Map guide</Popover.Title>
                    <Popover.Close aria-label="Close map guide">
                      <X size={16} />
                    </Popover.Close>
                  </div>
                  <div
                    className="atlas-map-legend"
                    aria-label="Port status legend"
                  >
                    {Object.entries(portStates).map(([state, label]) => (
                      <span key={state}>
                        <i data-state={state} />
                        {label}
                        {counts[state] ? ` · ${counts[state]}` : ""}
                      </span>
                    ))}
                  </div>
                  <p className="atlas-map-help">
                    Values are TH/s. Hover or focus for port details; click for
                    options. Use arrow keys to move between ports.
                  </p>
                  <p className="atlas-map-notice">
                    Live hash-rate and sleep readings are not connected.
                    Occupied ports show ? until telemetry is available;
                    reservations and physical locations come from Atlas.
                  </p>
                  <p className="atlas-map-help">
                    Coordinates are row / column, starting at 0. The state or
                    hash rate is at the lower left of each box; its address is
                    at the upper right.
                  </p>
                  <p className="atlas-map-help">
                    Building inventory includes miners at that building or
                    reserved to its ports. Repair counts include reserved miners
                    away in repair areas. The Can summary covers only the
                    selected can.
                  </p>
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
          <button onClick={onRefresh} className="atlas-text-button">
            <RefreshCw size={14} />
            Refresh map
          </button>
        </div>
      </div>
      {map.issues.map((issue) => (
        <p className="atlas-map-notice" role="alert" key={issue}>
          {issue}
        </p>
      ))}
      {hover &&
        createPortal(
          <div
            className="atlas-port-tooltip"
            role="tooltip"
            style={{ left: hover.left, top: hover.top, bottom: hover.bottom }}
          >
            {cellDescription(hover.cell)}
          </div>,
          document.body
        )}
      <Popover.Root<MapCell>>
        {({ payload }) => (
          <>
            <div
              className="atlas-map-scroll"
              role="region"
              aria-label="Scrollable port grid"
              onScroll={() => setHover(null)}
            >
              <table className="atlas-port-grid">
                <caption className="sr-only">
                  {map.rows} rows and {map.columns} columns of deployment
                  locations
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Row</th>
                    {Array.from({ length: map.columns }, (_, col) => (
                      <th key={col} scope="col">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: map.rows }, (_, row) => (
                    <tr key={row}>
                      <th scope="row">{row}</th>
                      {map.cells
                        .slice(row * map.columns, (row + 1) * map.columns)
                        .map((cell, col) => {
                          const index = row * map.columns + col,
                            display = portDisplay(cell)
                          return (
                            <td key={col}>
                              <Popover.Trigger
                                payload={cell}
                                ref={buttonRefs[index]}
                                tabIndex={focused === index ? 0 : -1}
                                onFocus={(event) => {
                                  setFocused(index)
                                  inspect(event, cell)
                                }}
                                onBlur={() => setHover(null)}
                                onMouseEnter={(event) => inspect(event, cell)}
                                onMouseLeave={() => setHover(null)}
                                onClick={() => {
                                  setHover(null)
                                  onPortSelect(cell)
                                }}
                                onKeyDown={(event) => moveFocus(event, index)}
                                className="atlas-port-cell"
                                data-state={display.state}
                                data-last-port={
                                  matchesLastPort(cell, map.id, lastPort)
                                    ? "true"
                                    : undefined
                                }
                                aria-label={`${cellDescription(cell)}${matchesLastPort(cell, map.id, lastPort) ? "\nLast selected port" : ""}`}
                              >
                                <span
                                  className="atlas-port-value"
                                  aria-hidden="true"
                                >
                                  {display.text}
                                </span>
                                <span
                                  className="atlas-port-coordinate"
                                  aria-hidden="true"
                                >
                                  {cell.row}/{cell.column}
                                </span>
                              </Popover.Trigger>
                            </td>
                          )
                        })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Popover.Portal>
              <Popover.Positioner
                sideOffset={8}
                className="atlas-port-positioner"
              >
                <Popover.Popup className="atlas-port-popup">
                  <div className="atlas-port-popup-heading">
                    <Popover.Title>
                      Port location · {payload?.row} / {payload?.column}
                    </Popover.Title>
                    <Popover.Close aria-label="Close port options">
                      <X size={16} />
                    </Popover.Close>
                  </div>
                  {payload && (
                    <>
                      <Popover.Description>
                        {payload.code ?? "Location not configured"}
                      </Popover.Description>
                      <p className="atlas-port-status">
                        {portStates[portDisplay(payload).state]}
                      </p>
                      <p>
                        {payload.port
                          ? `${payload.port.switch} · Port ${payload.port.number}`
                          : "No network port configured"}
                      </p>
                      <div className="atlas-port-miners">
                        {payload.occupant && (
                          <button onClick={() => onMiner(payload.occupant!.id)}>
                            <span>
                              Go to miner #{payload.occupant.identity}
                              <small>
                                {payload.occupant.serial} ·{" "}
                                {payload.occupant.ip ?? "IP not recorded"}
                              </small>
                            </span>
                            <ArrowUpRight size={16} />
                          </button>
                        )}
                        {payload.reservation &&
                          payload.reservation.id !== payload.occupant?.id && (
                            <button
                              onClick={() => onMiner(payload.reservation!.id)}
                            >
                              <span>
                                Go to reserved miner #
                                {payload.reservation.identity}
                                <small>
                                  {payload.reservation.serial} ·{" "}
                                  {payload.reservation.ip ?? "IP not recorded"}
                                </small>
                              </span>
                              <ArrowUpRight size={16} />
                            </button>
                          )}
                        {!payload.occupant && !payload.reservation && (
                          <p>No miner assigned to this location.</p>
                        )}
                      </div>
                      <h3>Actions</h3>
                      {!payload.occupant ? (
                        <Popover.Close
                          className="atlas-port-action"
                          disabled={
                            !payload.locationId ||
                            !payload.active ||
                            payload.conflict
                          }
                          onClick={() =>
                            onAction({
                              mode: "move",
                              locationId: payload.locationId!,
                              ...(payload.reservation
                                ? { minerId: payload.reservation.id }
                                : {}),
                            })
                          }
                        >
                          Add a miner here
                        </Popover.Close>
                      ) : (
                        <>
                          <Popover.Close
                            className="atlas-port-action"
                            onClick={() =>
                              onAction({
                                mode: "move",
                                minerId: payload.occupant!.id,
                              })
                            }
                          >
                            Update location
                          </Popover.Close>
                          <Popover.Close
                            className="atlas-port-action"
                            onClick={() =>
                              onAction({
                                mode: "edit",
                                minerId: payload.occupant!.id,
                              })
                            }
                          >
                            Update miner
                          </Popover.Close>
                        </>
                      )}
                      {!payload.locationId && (
                        <p className="atlas-port-footnote">
                          Configure this location before assigning a miner.
                        </p>
                      )}
                    </>
                  )}
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </>
        )}
      </Popover.Root>
    </section>
  )
}
