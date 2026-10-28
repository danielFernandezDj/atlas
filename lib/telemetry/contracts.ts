import type { Miner } from "../miners/contracts"

/** Atlas owns identity/location. These DTOs describe a separate telemetry source,
 * not Prisma fields or a presumed VNish API response. Null means not reported. */
export type OperationalState = "healthy" | "degraded" | "offline" | "partial"
export type BoardState =
  "mining" | "low-hashrate" | "failed-asic" | "missing" | "offline" | "unknown"
export type HashboardTelemetry = {
  number: number
  state: BoardState
  hashrateThs: number | null
  expectedThs: number
  hardwareErrors: number | null
  temperatureMinC: number | null
  temperatureMaxC: number | null
  frequencyMhz: number | null
  voltageV: number | null
  powerW: number | null
  chipsDetected: number | null
  chipsExpected: number
}
export type FanTelemetry = {
  number: number
  state: "operating" | "stopped" | "missing" | "unknown"
  rpm: number | null
}
export type PowerPreset = { powerW: number; hashrateThs: number }
export type TelemetrySettings = {
  cooling: {
    minimumFans: number
    speedLimitPercent: number
    targetC: number
    mode: "Auto" | "Manual"
  }
  performance: {
    preset: PowerPreset
    autoswitch: boolean
    raiseBelowC: number
    lowerAboveC: number
    maximumPreset: PowerPreset
    minimumPreset: PowerPreset
    conditionMinutes: number
    lowerTopPresetOnError: boolean
  }
  pools: {
    priority: number
    url: string
    worker: string
    status: "Active" | "Standby" | "Unknown"
  }[]
}
export type MinerLogEntry = {
  timestamp: string
  level: "INFO" | "WARN" | "ERROR"
  component: string
  message: string
}
export type MinerTelemetry = {
  source: "mock-vnish" | "vnish"
  minerId: number
  serialNumber: string
  sampleAsOf: string
  capturedAt: string
  freshness: "current-sample" | "stale"
  state: OperationalState
  firmware: string
  uptimeSeconds: number | null
  expectedThs: number
  boards: HashboardTelemetry[]
  fans: FanTelemetry[]
  fanDutyPercent: number | null
  psuModel: string | null
  /** Null: log source unavailable; empty array: no entries in this snapshot. */
  logs: MinerLogEntry[] | null
  settings: TelemetrySettings
}
export type TelemetryResult =
  | { kind: "ready"; telemetry: MinerTelemetry }
  | { kind: "unavailable" | "not-found" | "error"; message: string }
export interface MinerTelemetryProvider {
  getTelemetry(miner: Miner, signal?: AbortSignal): Promise<TelemetryResult>
}
export function summarizeTelemetry(telemetry: MinerTelemetry) {
  const knownHash = telemetry.boards.filter(
    (board) => board.hashrateThs !== null
  )
  const knownPower = telemetry.boards.filter((board) => board.powerW !== null)
  const sum = (values: number[]) =>
    Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100
  const completeCoverage =
    telemetry.boards.length === 3 &&
    [1, 2, 3].every(
      (number) =>
        telemetry.boards.filter((board) => board.number === number).length === 1
    )
  const hashrateThs =
    completeCoverage && knownHash.length === 3
      ? sum(knownHash.map((board) => board.hashrateThs!))
      : null
  const reportedHashrateThs = knownHash.length
    ? sum(knownHash.map((board) => board.hashrateThs!))
    : null
  const powerW =
    completeCoverage && knownPower.length === 3
      ? sum(knownPower.map((board) => board.powerW!))
      : null
  const temperatures = telemetry.boards.flatMap((board) =>
    board.temperatureMaxC === null ? [] : [board.temperatureMaxC]
  )
  return {
    hashrateThs,
    reportedHashrateThs,
    powerW,
    performancePercent:
      hashrateThs !== null && telemetry.expectedThs > 0
        ? (hashrateThs / telemetry.expectedThs) * 100
        : null,
    efficiencyJth:
      hashrateThs !== null && hashrateThs > 0 && powerW !== null
        ? powerW / hashrateThs
        : null,
    temperatureC: temperatures.length
      ? sum(temperatures) / temperatures.length
      : null,
    highestTemperatureC: temperatures.length ? Math.max(...temperatures) : null,
    temperatureCoverage: temperatures.length,
  }
}
export function temperatureState(
  value: number | null
): "unknown" | "normal" | "warning" | "critical" {
  return value === null
    ? "unknown"
    : value >= 85
      ? "critical"
      : value >= 78
        ? "warning"
        : "normal"
}
