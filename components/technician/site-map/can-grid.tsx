"use client"
/**
 * Renders can cells, keyboard navigation, last-port highlights, hover details,
 * color filters and the map guide. LiveSiteMap supplies the database map; callbacks
 * open the selected miner or action form rather than writing inventory here.
 *
 * Navigation: focus/hover state; restored-port focus; keyboard movement; status counts; toolbar and filters; hover portal; grid cells and action popup.
 * The grid interactions stay together because they share cell refs and focus/hover coordinates.
 */

import "@/components/technician/site-map/live-site-map.css"
import type { ActionContext } from "@/lib/inventory-actions/contracts"
import {
  cellDescription,
  matchesLastPort,
  matchesPortFilter,
  portDisplay,
  portStates,
  type LastMapPort,
  type LiveCanMap,
  type MapCell,
  type PortState,
} from "@/lib/site-map/live-contracts"
import { Popover } from "@base-ui/react/popover"
import {
  ArrowUpRight,
  BookOpen,
  ListFilter,
  LocateFixed,
  RefreshCw,
  X,
} from "lucide-react"
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react"
import { createPortal } from "react-dom"
export function CanGrid({
  filters,
  onFiltersChange,
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
  filters: PortState[]
  onFiltersChange: (filters: PortState[]) => void
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
  // Cell focus and hover use the same refs so pointer and keyboard inspection agree.
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
  // Restore last-port focus only once per requested jump.
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
  // Keyboard movement follows the displayed row/column order.
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
  // Status counts and toolbar describe the unfiltered map, while filtering only changes emphasis.
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
        {/* Toolbar: last-port return, status filters, guide and refresh. */}
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
            <Popover.Trigger
              className="atlas-text-button"
              aria-label="Filter map"
            >
              <ListFilter size={14} aria-hidden="true" />
              Filter{filters.length ? ` (${filters.length})` : ""}
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Positioner
                sideOffset={8}
                align="end"
                className="atlas-port-positioner"
              >
                <Popover.Popup className="atlas-map-guide atlas-map-filter">
                  <div className="atlas-port-popup-heading">
                    <Popover.Title>Filter map colors</Popover.Title>
                    <Popover.Close aria-label="Close map filters">
                      <X size={16} />
                    </Popover.Close>
                  </div>
                  <p>
                    Keep selected colors visible. Other ports stay in place with
                    a muted background.
                  </p>
                  <div className="atlas-filter-options">
                    {(Object.entries(portStates) as [PortState, string][]).map(
                      ([state, label]) => (
                        <label key={state}>
                          <input
                            type="checkbox"
                            checked={filters.includes(state)}
                            onChange={() =>
                              onFiltersChange(
                                filters.includes(state)
                                  ? filters.filter((value) => value !== state)
                                  : [...filters, state]
                              )
                            }
                          />
                          <i data-state={state} />
                          <span>{label}</span>
                          <small>{counts[state] ?? 0}</small>
                        </label>
                      )
                    )}
                  </div>
                  <button
                    className="atlas-text-button"
                    onClick={() => onFiltersChange([])}
                  >
                    Show all colors
                  </button>
                  <p role="status">
                    {
                      map.cells.filter((cell) =>
                        matchesPortFilter(portDisplay(cell).state, filters)
                      ).length
                    }{" "}
                    of {map.cells.length} ports match
                  </p>
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
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
                  <section
                    className="atlas-can-stage-guide"
                    aria-label="Can button guide"
                  >
                    <h3>Can buttons</h3>
                    <p>
                      The left side is the can number; the right side counts
                      unique miners physically in the can or reserved to its
                      ports, including miners away in repair.
                    </p>
                    <ul>
                      <li>
                        <i data-can-stage="healthy" />
                        95–100% of assigned miners hashing: green.
                      </li>
                      <li>
                        <i data-can-stage="warning" />
                        90–under 95% hashing: orange.
                      </li>
                      <li>
                        <i data-can-stage="critical" />
                        Below 90% hashing: red.
                      </li>
                      <li>
                        <i data-can-stage="empty" />
                        No assigned miners: faint gray.
                      </li>
                      <li>
                        <i data-can-stage="unknown" />
                        Miners assigned but hashing readings unavailable:
                        neutral.
                      </li>
                    </ul>
                    <p>
                      Hashing percentage needs fresh readings for every assigned
                      miner. No live telemetry is connected yet, so populated
                      cans currently show the neutral state. Inventory counts
                      alone do not indicate mining health.
                    </p>
                  </section>
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
      {/* Hover details use a portal so the scrolling grid does not clip them. */}
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
      {/* Cells and their action popup share one selection and keyboard-focus model. */}
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
                                data-filter-muted={
                                  !matchesPortFilter(display.state, filters) ||
                                  undefined
                                }
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
                        Building {map.building} · Can {map.number} · Row{" "}
                        {payload.row} · Column {payload.column}
                      </Popover.Description>
                      <p className="atlas-port-status">
                        {payload.port?.active === false
                          ? "Disabled port"
                          : portStates[portDisplay(payload).state]}
                      </p>
                      <details className="atlas-port-network-details">
                        <summary>Network details</summary>
                        <dl>
                          <div>
                            <dt>Location code</dt>
                            <dd>{payload.code ?? "Not configured"}</dd>
                          </div>
                          <div>
                            <dt>Network switch</dt>
                            <dd>{payload.port?.switch ?? "Not configured"}</dd>
                          </div>
                          <div>
                            <dt>Switch socket</dt>
                            <dd>{payload.port?.number ?? "Not configured"}</dd>
                          </div>
                        </dl>
                        <p>
                          The map uses row/column coordinates starting at 0.
                          Switch socket numbers are separate inventory labels.
                          In location codes, B = building, C = can, R = row and
                          S = column.
                        </p>
                      </details>
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
                      {payload.locationId &&
                      payload.port &&
                      !payload.conflict ? (
                        <>
                          {payload.active && (
                            <Popover.Close
                              className="atlas-port-action"
                              onClick={() =>
                                onAction({
                                  portAction:
                                    payload.occupant || payload.reservation
                                      ? "replace"
                                      : "add",
                                  locationId: payload.locationId!,
                                })
                              }
                            >
                              {payload.occupant || payload.reservation
                                ? "Replace miner"
                                : "Add a miner here"}
                            </Popover.Close>
                          )}
                          {payload.occupant && (
                            <Popover.Close
                              className="atlas-port-action"
                              onClick={() =>
                                onAction({
                                  portAction: "pull",
                                  locationId: payload.locationId!,
                                })
                              }
                            >
                              Pull miner
                            </Popover.Close>
                          )}
                          {!payload.occupant && payload.reservation && (
                            <>
                              {payload.active && (
                                <Popover.Close
                                  className="atlas-port-action"
                                  onClick={() =>
                                    onAction({
                                      portAction: "return",
                                      locationId: payload.locationId!,
                                    })
                                  }
                                >
                                  Return reserved miner
                                </Popover.Close>
                              )}
                              <Popover.Close
                                className="atlas-port-action"
                                onClick={() =>
                                  onAction({
                                    portAction: "release",
                                    locationId: payload.locationId!,
                                  })
                                }
                              >
                                Release reservation
                              </Popover.Close>
                            </>
                          )}
                          <Popover.Close
                            className="atlas-port-action"
                            onClick={() =>
                              onAction({
                                portAction:
                                  payload.port!.active === false
                                    ? "enable"
                                    : "disable",
                                locationId: payload.locationId!,
                              })
                            }
                          >
                            {payload.port.active === false
                              ? "Re-enable port"
                              : "Disable port"}
                          </Popover.Close>
                          {!payload.active && payload.port.active !== false && (
                            <p className="atlas-port-footnote">
                              This location or its hierarchy is inactive.
                              Assignments are unavailable until it is restored.
                            </p>
                          )}
                        </>
                      ) : payload.conflict ? (
                        <p className="atlas-port-footnote">
                          Conflicting assignments need to be reconciled before
                          changing this port.
                        </p>
                      ) : (
                        <p className="atlas-port-footnote">
                          Configure a network port for this location before
                          using port actions.
                        </p>
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
