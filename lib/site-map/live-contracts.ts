export const portStates = {
  hashing: "Hashing",
  slow: "Low hash rate",
  zero: "Zero hash rate",
  sleeping: "Sleeping",
  repair: "Reserved · miner in repair",
  reserved: "Reserved · miner elsewhere",
  empty: "Empty",
  unknown: "Occupied · telemetry unavailable",
  unconfigured: "Not configured",
  inactive: "Inactive",
  conflict: "Assignment conflict",
} as const
export type PortState = keyof typeof portStates
export type MapMiner = {
  id: number
  identity: number
  serial: string
  ip: string | null
  locationId: number | null
  locationKind: string | null
}
export type MapCell = {
  row: number
  column: number
  locationId: number | null
  code: string | null
  active: boolean
  port: {
    id: number
    active?: boolean
    number: string
    switch: string
    observedMac: string | null
    lastSeenAt: string | null
  } | null
  occupant: MapMiner | null
  reservation: MapMiner | null
  conflict: boolean
}
export type LiveCanMap = {
  id: number
  siteId: number
  building: number
  number: string
  rows: number
  columns: number
  active: boolean
  cells: MapCell[]
  issues: string[]
  loadedAt: string
}
export type MapTelemetry = {
  hashRateThs: number | null
  expectedThs: number | null
  sleeping: boolean | null
  sampledAt: string
}
export function portDisplay(
  cell: MapCell,
  telemetry?: MapTelemetry,
  now = Date.now()
): { state: PortState; text: string } {
  if (cell.conflict) return { state: "conflict", text: "!" }
  if (!cell.active) return { state: "inactive", text: "×" }
  if (!cell.locationId) return { state: "unconfigured", text: "·" }
  if (!cell.occupant) {
    if (cell.reservation)
      return {
        state:
          cell.reservation.locationKind === "REPAIR" ? "repair" : "reserved",
        text: "R",
      }
    return { state: "empty", text: "—" }
  }
  const age = telemetry ? now - Date.parse(telemetry.sampledAt) : NaN
  if (!telemetry || !Number.isFinite(age) || age < -10000 || age > 120000)
    return { state: "unknown", text: "?" }
  if (telemetry.sleeping === true) return { state: "sleeping", text: "S" }
  const rate = telemetry.hashRateThs
  if (rate === null || !Number.isFinite(rate) || rate < 0)
    return { state: "unknown", text: "?" }
  if (rate === 0) return { state: "zero", text: "0 H" }
  const low =
    telemetry.expectedThs !== null &&
    Number.isFinite(telemetry.expectedThs) &&
    telemetry.expectedThs > 0 &&
    rate < telemetry.expectedThs * 0.9
  return { state: low ? "slow" : "hashing", text: String(Math.round(rate)) }
}
export function cellDescription(cell: MapCell) {
  const state = portDisplay(cell)
  return [
    `Row ${cell.row} · Column ${cell.column}`,
    cell.port
      ? `Network switch ${cell.port.switch} · Socket ${cell.port.number} (separate from grid coordinates)`
      : "No network port configured",
    cell.occupant
      ? `Miner #${cell.occupant.identity} · ${cell.occupant.serial}`
      : "No miner physically present",
    cell.occupant ? `Recorded IP: ${cell.occupant.ip ?? "Not recorded"}` : null,
    cell.port?.active === false ? "Disabled port" : portStates[state.state],
    cell.reservation
      ? `Reserved: Miner #${cell.reservation.identity} · ${cell.reservation.serial} · Recorded IP: ${cell.reservation.ip ?? "Not recorded"}`
      : null,
  ]
    .filter(Boolean)
    .join("\n")
}

export type BuildingMapSummary = {
  id: number
  number: number
  active: boolean
  linked: number
  deployed: number
  repair: number
  staging: number
  pallet: number
  reserved: number
  cans: CanInventorySummary[]
  loadedAt: string
}

export type LastMapPort = {
  siteId: number
  buildingId: number
  canId: number
  buildingNumber: number
  canNumber: string
  row: number
  column: number
  locationId: number | null
}
export function matchesLastPort(
  cell: MapCell,
  canId: number,
  last: LastMapPort | null
) {
  return (
    !!last &&
    last.canId === canId &&
    last.row === cell.row &&
    last.column === cell.column &&
    last.locationId === cell.locationId
  )
}

export type CanStage = "empty" | "unknown" | "healthy" | "warning" | "critical"
export type CanInventorySummary = {
  id: number
  miners: number
  stage: CanStage
  hashingPercent: number | null
}
export function canHealth(
  total: number,
  hashing: number | null,
  reported = 0
): { stage: CanStage; hashingPercent: number | null } {
  if (!Number.isInteger(total) || total < 0)
    return { stage: "unknown", hashingPercent: null }
  if (total === 0) return { stage: "empty", hashingPercent: null }
  if (
    hashing === null ||
    !Number.isInteger(hashing) ||
    hashing < 0 ||
    hashing > total ||
    reported !== total
  )
    return { stage: "unknown", hashingPercent: null }
  const hashingPercent = (hashing / total) * 100
  return {
    stage:
      hashingPercent >= 95
        ? "healthy"
        : hashingPercent >= 90
          ? "warning"
          : "critical",
    hashingPercent,
  }
}
export function summarizeCanAssignments(can: {
  id: number
  locations: {
    current_miners: { id: number }[]
    ports: { reserved_miner_id: number | null }[]
  }[]
}): CanInventorySummary {
  const ids = new Set<number>()
  for (const location of can.locations) {
    for (const miner of location.current_miners) ids.add(miner.id)
    for (const port of location.ports)
      if (port.reserved_miner_id !== null) ids.add(port.reserved_miner_id)
  }
  return { id: can.id, miners: ids.size, ...canHealth(ids.size, null) }
}
export const canStageLabels: Record<CanStage, string> = {
  empty: "No miners assigned",
  unknown: "Hashing status unavailable",
  healthy: "95–100% hashing",
  warning: "90–under 95% hashing",
  critical: "Below 90% hashing",
}

export function matchesPortFilter(
  state: PortState,
  selected: readonly PortState[]
): boolean {
  return selected.length === 0 || selected.includes(state)
}
