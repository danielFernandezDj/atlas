import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import ts from "typescript"
const compile = async (path) =>
  ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
const url = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
const { MockMinerTelemetryProvider } = await import(
  url(await compile("../lib/demo/miner-telemetry.ts"))
)
const { summarizeTelemetry, temperatureState } = await import(
  url(await compile("../lib/telemetry/contracts.ts"))
)
const contracts = url(await compile("../lib/miners/contracts.ts")),
  map = url(await compile("../lib/site-map/model.ts"))
const { createDemoMinerService } = await import(
  url(
    (await compile("../lib/demo/miner-service.ts"))
      .replace('"../miners/contracts"', JSON.stringify(contracts))
      .replace('"../site-map/model"', JSON.stringify(map))
  )
)
const service = createDemoMinerService({ latency: 0 })
const miner = (await service.getMiner(1)).miner
const get = (scenario, asset = miner) =>
  new MockMinerTelemetryProvider(scenario, 0).getTelemetry(asset)
const snapshot = async (scenario) => {
  const result = await get(scenario)
  assert.equal(result.kind, "ready")
  return result.telemetry
}
test("Board 2 failed-ASIC sample preserves operational boards and consistent totals", async () => {
  const data = await snapshot("degraded"),
    summary = summarizeTelemetry(data)
  assert.equal(data.boards[1].state, "failed-asic")
  assert.equal(data.boards[1].hashrateThs, 0)
  assert.equal(data.boards[1].chipsDetected, 0)
  assert.equal(data.boards[0].state, "mining")
  assert.equal(data.boards[2].state, "mining")
  assert.equal(
    summary.hashrateThs,
    Number(data.boards.reduce((sum, b) => sum + b.hashrateThs, 0).toFixed(2))
  )
  assert.equal(
    summary.powerW,
    data.boards.reduce((sum, b) => sum + b.powerW, 0)
  )
  assert.equal(summary.efficiencyJth, summary.powerW / summary.hashrateThs)
  assert.equal(
    summary.performancePercent,
    (summary.hashrateThs / data.expectedThs) * 100
  )
})
test("healthy profiles follow existing assigned miner models, not location", async () => {
  const first = await get("healthy"),
    second = await get("healthy", (await service.getMiner(2)).miner)
  assert.equal(first.telemetry.expectedThs, 110)
  assert.equal(second.telemetry.expectedThs, 200)
  assert.equal(second.telemetry.state, "healthy")
  assert.equal(second.telemetry.boards.length, 3)
  assert.equal(second.telemetry.fans.length, 4)
  const relocated = await get("healthy", { ...miner, current_location: null })
  assert.deepEqual(relocated, first)
})
test("partial data stays unknown, distinguishes stopped and missing fans", async () => {
  const data = await snapshot("partial"),
    summary = summarizeTelemetry(data)
  assert.equal(data.boards[1].state, "unknown")
  assert.equal(data.boards[1].hashrateThs, null)
  assert.equal(summary.hashrateThs, null)
  assert.ok(summary.reportedHashrateThs > 0)
  assert.equal(summary.powerW, null)
  assert.equal(summary.efficiencyJth, null)
  assert.equal(summary.temperatureCoverage, 2)
  assert.equal(data.fans[2].state, "stopped")
  assert.equal(data.fans[2].rpm, 0)
  assert.equal(data.fans[3].state, "missing")
  assert.equal(data.fans[3].rpm, null)
})
test("confirmed offline is explicit zero output rather than a missing-data fallback", async () => {
  const data = await snapshot("offline"),
    summary = summarizeTelemetry(data)
  assert.equal(data.state, "offline")
  assert.equal(summary.hashrateThs, 0)
  assert.equal(summary.efficiencyJth, null)
  assert.equal(summary.temperatureC, null)
  assert.ok(data.fans.every((fan) => fan.rpm === null))
})
test("unavailable, device-not-found, failure and missing model do not manufacture zero readings", async () => {
  for (const kind of ["unavailable", "not-found", "error"]) {
    const result = await get(kind)
    assert.equal(result.kind, kind)
    assert.equal(result.telemetry, undefined)
  }
  assert.equal(
    (await get("healthy", (await service.getMiner(3)).miner)).kind,
    "unavailable"
  )
})
test("staleness has explicit capture/reference times, deterministic samples and bounded settings", async () => {
  const data = await snapshot("stale")
  assert.equal(data.freshness, "stale")
  assert.equal(
    Date.parse(data.sampleAsOf) - Date.parse(data.capturedAt),
    90 * 60 * 1000
  )
  assert.deepEqual(await snapshot("stale"), data)
  const settings = data.settings
  assert.equal(settings.cooling.minimumFans, 3)
  assert.equal(settings.cooling.speedLimitPercent, 85)
  assert.ok(
    settings.performance.minimumPreset.powerW <=
      settings.performance.preset.powerW
  )
  assert.ok(
    settings.performance.maximumPreset.powerW >=
      settings.performance.preset.powerW
  )
  assert.deepEqual(
    settings.pools.map((p) => p.priority),
    [1, 2]
  )
  assert.ok(settings.pools.every((p) => p.url.includes(".example:")))
})
test("temperature boundaries and zero-denominator efficiency are explicit", async () => {
  assert.equal(temperatureState(null), "unknown")
  assert.equal(temperatureState(77), "normal")
  assert.equal(temperatureState(78), "warning")
  assert.equal(temperatureState(85), "critical")
  const data = await snapshot("healthy")
  data.expectedThs = 0
  assert.equal(summarizeTelemetry(data).performancePercent, null)
})
test("telemetry reads are abortable and do not alter inventory or history", async () => {
  const before = await service.getMiner(1),
    history = await service.getHistory(1)
  await get("degraded")
  await get("partial")
  assert.deepEqual(await service.getMiner(1), before)
  assert.deepEqual(await service.getHistory(1), history)
  const controller = new AbortController()
  const promise = new MockMinerTelemetryProvider("healthy", 100).getTelemetry(
    miner,
    controller.signal
  )
  controller.abort()
  await assert.rejects(promise, { name: "AbortError" })
})
test("preview contains no requests, database access, credentials or operational write controls", async () => {
  const sources = await Promise.all(
    [
      "../lib/demo/miner-telemetry.ts",
      "../lib/telemetry/contracts.ts",
      "../components/technician/miner-record/telemetry-settings.tsx",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8"))
  )
  for (const source of sources)
    assert.doesNotMatch(
      source,
      /fetch\(|axios|prisma\.|DATABASE_URL|api_key|type="submit"|onSubmit=|<input|<select/
    )
})

test("absent board entries do not become a confirmed zero or complete total", async () => {
  const data = await snapshot("healthy")
  data.boards = []
  const empty = summarizeTelemetry(data)
  assert.equal(empty.hashrateThs, null)
  assert.equal(empty.powerW, null)
  assert.equal(empty.reportedHashrateThs, null)
  const partial = await snapshot("healthy")
  partial.boards.splice(1, 1)
  const totals = summarizeTelemetry(partial)
  assert.equal(totals.hashrateThs, null)
  assert.equal(totals.powerW, null)
  assert.ok(totals.reportedHashrateThs > 0)
})

test("sample logs align with board conditions and snapshot timestamps", async () => {
  for (const scenario of [
    "healthy",
    "degraded",
    "offline",
    "partial",
    "stale",
  ]) {
    const data = await snapshot(scenario)
    assert.ok(data.logs.length > 0)
    assert.equal(data.logs.at(-1).timestamp, data.capturedAt)
    assert.ok(
      data.logs.every(
        (entry, index) =>
          Date.parse(entry.timestamp) <= Date.parse(data.capturedAt) &&
          (index === 0 || entry.timestamp >= data.logs[index - 1].timestamp)
      )
    )
    const board2 = data.logs.find((entry) => entry.component === "board-2")
    assert.equal(
      board2.level,
      scenario === "degraded"
        ? "ERROR"
        : scenario === "partial"
          ? "WARN"
          : "INFO"
    )
    if (scenario === "partial")
      assert.match(board2.message, /condition unknown/)
    if (scenario === "offline") assert.match(board2.message, /Offline sample/)
    if (scenario === "degraded")
      assert.match(board2.message, /ASIC detection failed/)
  }
})
