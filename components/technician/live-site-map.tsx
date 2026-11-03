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
import { ArrowUpRight, MapPin, RefreshCw, X } from "lucide-react"
import { createPortal } from "react-dom"
import { Popover } from "@base-ui/react/popover"
import type { DashboardData } from "@/lib/dashboard/contracts"
import {
  cellDescription,
  portDisplay,
  portStates,
  type LiveCanMap,
  type MapCell,
} from "@/lib/site-map/live-contracts"
import "./live-site-map.css"
export function LiveSiteMap({
  siteId,
  siteName,
  buildings,
  refreshKey,
  onMiner,
}: {
  siteId: number
  siteName: string
  buildings: DashboardData["buildings"]
  refreshKey: string
  onMiner: (id: number) => void
}) {
  const [buildingId, setBuildingId] = useState<number | null>(
    buildings[0]?.id ?? null
  )
  const building = buildings.find((b) => b.id === buildingId)
  const cans = [...(building?.cans ?? [])].sort((a, b) =>
    a.number.localeCompare(b.number, undefined, { numeric: true })
  )
  const [canId, setCanId] = useState<number | null>(cans[0]?.id ?? null)
  const [refresh, setRefresh] = useState(0)
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
        <div className="atlas-map-selector-heading">
          <MapPin size={18} />
          <h2>{siteName} · Site map</h2>
        </div>
        <fieldset>
          <legend>Building</legend>
          <div className="atlas-map-options">
            {buildings.map((b) => (
              <button
                key={b.id}
                aria-pressed={b.id === buildingId}
                onClick={() => chooseBuilding(b.id)}
              >
                Building {b.number}
                {!b.active && <span>Inactive</span>}
              </button>
            ))}
            {!buildings.length && <p>No buildings configured at this site.</p>}
          </div>
        </fieldset>
        <fieldset>
          <legend>Can</legend>
          <div className="atlas-map-options atlas-map-can-options">
            {cans.map((c) => (
              <button
                key={c.id}
                aria-pressed={c.id === canId}
                onClick={() => setCanId(c.id)}
              >
                Can {c.number}
                <span>
                  {c.slots} locations{!c.active && " · Inactive"}
                </span>
              </button>
            ))}
            {building && !cans.length && (
              <p>No cans configured in this building.</p>
            )}
          </div>
        </fieldset>
      </section>
      {canId !== null && (
        <CanGrid
          key={`${siteId}-${canId}-${refreshKey}-${refresh}`}
          siteId={siteId}
          canId={canId}
          onMiner={onMiner}
          onRefresh={() => setRefresh((v) => v + 1)}
        />
      )}
    </div>
  )
}
function CanGrid({
  siteId,
  canId,
  onMiner,
  onRefresh,
}: {
  siteId: number
  canId: number
  onMiner: (id: number) => void
  onRefresh: () => void
}) {
  const [map, setMap] = useState<LiveCanMap | null>(null),
    [error, setError] = useState("")
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
  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/site-map?site=${siteId}&can=${canId}`, {
      signal: controller.signal,
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.message ?? "Map unavailable.")
        if (!controller.signal.aborted) setMap(data)
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error ? failure.message : "Map unavailable."
          )
      })
    return () => controller.abort()
  }, [siteId, canId])
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
        <button onClick={onRefresh} className="atlas-text-button">
          <RefreshCw size={14} />
          Refresh map
        </button>
      </div>
      <div className="atlas-map-legend" aria-label="Port status legend">
        {Object.entries(portStates).map(([state, label]) => (
          <span key={state}>
            <i data-state={state} />
            {label}
            {counts[state] ? ` · ${counts[state]}` : ""}
          </span>
        ))}
      </div>
      <p className="atlas-map-help">
        Values are TH/s. Hover or focus for port details; click for options. Use
        arrow keys to move between ports.
      </p>
      <p className="atlas-map-notice">
        Live hash-rate and sleep readings are not connected. Occupied ports show
        ? until telemetry is available; reservations and physical locations come
        from Atlas.
      </p>
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
                                onClick={() => setHover(null)}
                                onKeyDown={(event) => moveFocus(event, index)}
                                className="atlas-port-cell"
                                data-state={display.state}

                                aria-label={cellDescription(cell)}
                              >
                                {display.text}
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
                      <button disabled className="atlas-port-future">
                        Disconnect miner
                      </button>
                      <button disabled className="atlas-port-future">
                        Replace miner
                      </button>
                      <p className="atlas-port-footnote">
                        Movement actions are not connected yet.
                      </p>
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
