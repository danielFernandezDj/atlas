import type { Miner } from "../miners/contracts"
import type {
  HashboardTelemetry,
  MinerTelemetryProvider,
  TelemetryResult,
} from "../telemetry/contracts"

export const demoTelemetryScenarios = [
  "assigned",
  "healthy",
  "degraded",
  "offline",
  "partial",
  "stale",
  "unavailable",
  "not-found",
  "error",
] as const
export type DemoTelemetryScenario = (typeof demoTelemetryScenarios)[number]
export const scenarioLabels: Record<DemoTelemetryScenario, string> = {
  assigned: "Assigned sample",
  healthy: "Healthy miner",
  degraded: "Board 2 ASIC failure",
  offline: "Confirmed offline",
  partial: "Partial telemetry",
  stale: "Stale snapshot",
  unavailable: "Telemetry unavailable",
  "not-found": "Not found in VNish",
  error: "API failure preview",
}
const sampleAsOf = "2026-10-28T15:00:00.000Z"
/** Explicit demo profiles, never inferred from physical location or movement reason. */
export class MockMinerTelemetryProvider implements MinerTelemetryProvider {
  constructor(
    private scenario: DemoTelemetryScenario = "assigned",
    private latency = 220
  ) {}
  async getTelemetry(
    miner: Miner,
    signal?: AbortSignal
  ): Promise<TelemetryResult> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError")
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer)
        reject(new DOMException("Aborted", "AbortError"))
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", abort)
        resolve()
      }, this.latency)
      signal?.addEventListener("abort", abort, { once: true })
    })
    const assigned: DemoTelemetryScenario[] = [
      "degraded",
      "healthy",
      "unavailable",
      "offline",
      "partial",
      "stale",
      "not-found",
      "error",
    ]
    const scenario =
      this.scenario === "assigned"
        ? assigned[(miner.id - 1) % assigned.length]
        : this.scenario
    if (scenario === "unavailable")
      return {
        kind: "unavailable",
        message:
          "No telemetry source is available for this sample. The Atlas asset record is still accessible.",
      }
    if (scenario === "not-found")
      return {
        kind: "not-found",
        message:
          "This sample represents an Atlas asset with no matching VNish device. Identity and movement history remain available.",
      }
    if (scenario === "error")
      return {
        kind: "error",
        message:
          "Simulated telemetry request failure. This does not confirm a miner or hardware fault.",
      }
    // Model-specific mock profiles only. Unrecognized/unassigned models have no guessed configuration.
    const name = miner.model?.name.toLowerCase() ?? ""
    const profile = name.includes("s21")
      ? { ths: 200, power: 3500, chips: 108, psu: "APW171215" }
      : name.includes("s19")
        ? { ths: 110, power: 3250, chips: 114, psu: "APW121215" }
        : name.includes("m50")
          ? { ths: 126, power: 3276, chips: 117, psu: "P221B" }
          : null
    if (!profile)
      return {
        kind: "unavailable",
        message:
          "No synthetic model profile is assigned. Atlas identity and location are shown without invented telemetry.",
      }
    const boards: HashboardTelemetry[] = Array.from(
      { length: 3 },
      (_, index) => {
        const failed = scenario === "degraded" && index === 1,
          unknown = scenario === "partial" && index === 1,
          offline = scenario === "offline"
        const hashrateThs = unknown
          ? null
          : failed || offline
            ? 0
            : Math.round(
                (profile.ths / 3) *
                  (index === 0 ? 0.99 : index === 1 ? 0.98 : 1) *
                  100
              ) / 100
        return {
          number: index + 1,
          state: unknown
            ? "unknown"
            : failed
              ? "failed-asic"
              : offline
                ? "offline"
                : "mining",
          hashrateThs,
          expectedThs: profile.ths / 3,
          hardwareErrors: unknown ? null : failed ? 12 : 0,
          temperatureMinC: unknown || offline ? null : failed ? 34 : 58 + index,
          temperatureMaxC: unknown || offline ? null : failed ? 36 : 64 + index,
          frequencyMhz: unknown
            ? null
            : failed || offline
              ? 0
              : name.includes("s21")
                ? 575
                : 525,
          voltageV: unknown || offline ? null : 12.1,
          powerW: unknown
            ? null
            : failed || offline
              ? 0
              : Math.round(profile.power / 3),
          chipsDetected: unknown || offline ? null : failed ? 0 : profile.chips,
          chipsExpected: profile.chips,
        }
      }
    )
    return {
      kind: "ready",
      telemetry: {
        source: "mock-vnish",
        minerId: miner.id,
        serialNumber: miner.serial_number,
        sampleAsOf,
        capturedAt:
          scenario === "stale"
            ? "2026-10-28T13:30:00.000Z"
            : "2026-10-28T14:59:40.000Z",
        freshness: scenario === "stale" ? "stale" : "current-sample",
        state:
          scenario === "offline"
            ? "offline"
            : scenario === "partial"
              ? "partial"
              : scenario === "degraded"
                ? "degraded"
                : "healthy",
        firmware: "VNish-style demo · 1.3.4",
        uptimeSeconds: scenario === "offline" ? null : 260640,
        expectedThs: profile.ths,
        boards,
        fans: Array.from({ length: 4 }, (_, index) => ({
          number: index + 1,
          state:
            scenario === "partial" && index === 3
              ? "missing"
              : scenario === "offline"
                ? "unknown"
                : scenario === "partial" && index === 2
                  ? "stopped"
                  : "operating",
          rpm:
            (scenario === "partial" && index === 3) || scenario === "offline"
              ? null
              : scenario === "partial" && index === 2
                ? 0
                : 3600 + index * 120,
        })),
        fanDutyPercent: scenario === "offline" ? null : 65,
        psuModel: profile.psu,
        settings: {
          cooling: {
            minimumFans: 3,
            speedLimitPercent: 85,
            targetC: 70,
            mode: "Auto",
          },
          performance: {
            preset: { powerW: profile.power, hashrateThs: profile.ths },
            autoswitch: true,
            raiseBelowC: 70,
            lowerAboveC: 83,
            maximumPreset: {
              powerW: Math.round(profile.power * 1.05),
              hashrateThs: Math.round(profile.ths * 1.04),
            },
            minimumPreset: {
              powerW: Math.round(profile.power * 0.72),
              hashrateThs: Math.round(profile.ths * 0.7),
            },
            conditionMinutes: 2,
            lowerTopPresetOnError: true,
          },
          pools: [
            {
              priority: 1,
              url: "stratum+tcp://primary.demo-pool.example:6000",
              worker: `atlas-demo.miner-${miner.id}`,
              status: scenario === "offline" ? "Unknown" : "Active",
            },
            {
              priority: 2,
              url: "stratum+tcp://backup.demo-pool.example:7000",
              worker: `atlas-demo.miner-${miner.id}`,
              status: scenario === "offline" ? "Unknown" : "Standby",
            },
          ],
        },
      },
    }
  }
}
