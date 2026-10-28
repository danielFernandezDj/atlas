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
const contracts = url(await compile("../lib/miners/contracts.ts")),
  model = url(await compile("../lib/site-map/model.ts"))
const { buildCells, countCells, mapAddress, mapWarnings, sopReference } =
  await import(model)
const { createDemoMinerService } = await import(
  url(
    (await compile("../lib/demo/miner-service.ts"))
      .replace('"../miners/contracts"', JSON.stringify(contracts))
      .replace('"../site-map/model"', JSON.stringify(model))
  )
)
const create = () => createDemoMinerService({ latency: 0 })
const query = { search: "", site_id: 1, kind: "", page: 1, page_size: 100 }
test("reference grid preserves all 385 coordinates and zero-based corners", async () => {
  const detail = await create().getCanMap(111),
    context = { ...detail, can: { ...detail.can, ...sopReference.standardCan } }
  const cells = buildCells(context, [])
  assert.equal(cells.length, 385)
  for (const [index, row, slot] of [
    [0, 0, 0],
    [34, 0, 34],
    [350, 10, 0],
    [384, 10, 34],
  ]) {
    assert.deepEqual([cells[index].row, cells[index].slot], [row, slot])
    assert.equal(
      mapAddress(context, row, slot),
      `North Site / B1 / Can 01 / ${row}-${slot}`
    )
  }
  assert.equal(countCells(cells)["not-configured"], 385)
})
test("actual can dimensions and authoritative occupancy distinguish empty and missing records", async () => {
  const detail = await create().getCanMap(111),
    cells = buildCells(detail, detail.locations, detail.miners),
    counts = countCells(cells)
  assert.equal(cells.length, 128)
  assert.equal(counts.occupied, 2)
  assert.equal(counts.empty, 1)
  assert.equal(counts["not-configured"], 125)
  assert.equal(cells[0].state, "not-configured")
  assert.equal(cells[2 * 16 + 4].miners[0].serial_number, "ATLAS-1001")
  assert.equal(cells[2 * 16 + 6].state, "empty")
  assert.equal(cells.at(-1).slot, 15)
})
test("unknown reads never manufacture available cells; inactive hierarchy preserves occupants", async () => {
  const detail = await create().getCanMap(111)
  assert.equal(countCells(buildCells(detail, null)).unknown, 128)
  const cells = buildCells(
    { ...detail, can: { ...detail.can, is_active: false } },
    detail.locations,
    detail.miners
  )
  assert.equal(cells[36].state, "inactive")
  assert.equal(cells[36].miners.length, 1)
  assert.equal(countCells(cells).empty, 0)
})
test("duplicate occupants and duplicate coordinate records remain explicit conflicts", async () => {
  const detail = await create().getCanMap(111),
    miner = detail.miners.find((m) => m.id === 1)
  const miners = [
    ...detail.miners,
    { ...miner, id: 999, serial_number: "CONFLICT-DEMO" },
  ]
  assert.equal(
    buildCells(detail, detail.locations, miners)[36].state,
    "conflict"
  )
  assert.equal(
    buildCells(
      detail,
      [...detail.locations, { ...detail.locations[0], id: 999 }],
      detail.miners
    )[36].state,
    "conflict"
  )
})
test("shared areas are excluded from rack cells; invalid coordinates produce warnings", async () => {
  const detail = await create().getCanMap(111),
    cells = buildCells(detail, detail.locations, detail.miners)
  assert.equal(cells.flatMap((c) => c.locations).length, 3)
  assert.equal(
    detail.miners.filter((m) => m.current_location.kind === "REPAIR").length,
    2
  )
  assert.equal(
    mapWarnings(detail, [
      ...detail.locations,
      { ...detail.locations[0], id: 999, row_index: 99 },
    ]).length,
    1
  )
})
test("overview uses same inventory, includes inactive cans, and reads perform no writes", async () => {
  const service = create(),
    before = await service.searchMiners(query),
    history = await service.getHistory(1)
  const overview = await service.getSiteMapOverview(1)
  assert.equal(overview.buildings.length, 2)
  assert.equal(overview.buildings[0].cans.length, 2)
  for (const { cans } of overview.buildings)
    for (const summary of cans) {
      const detail = await service.getCanMap(summary.can.id)
      assert.deepEqual(
        summary.counts,
        countCells(buildCells(detail, detail.locations, detail.miners))
      )
    }
  assert.deepEqual(await service.searchMiners(query), before)
  assert.deepEqual(await service.getHistory(1), history)
  const duplicateTags = await service.searchMiners({
    ...query,
    search: "ASSET-204",
  })
  assert.ok(duplicateTags.total > 1)
  assert.equal(
    (await service.searchMiners({ ...query, search: "ATLAS-1007" })).items[0]
      .current_location.can_id,
    121
  )
})
test("map reflects existing movement workflow without maintaining a second inventory", async () => {
  const service = create()
  await service.move({
    miner_id: 1,
    destination_location_id: 1112,
    reason: "DEPLOYMENT",
    notes: "",
    expected_version: 2,
    submission_key: crypto.randomUUID(),
  })
  const detail = await service.getCanMap(111),
    cells = buildCells(detail, detail.locations, detail.miners)
  assert.equal(cells[36].state, "empty")
  assert.equal(cells[38].miners[0].id, 1)
})
test("map read failure is recoverable and abort does not return a successful map", async () => {
  const service = create()
  service.demo.failNextRead()
  await assert.rejects(service.getCanMap(111))
  assert.equal((await service.getCanMap(111)).can.id, 111)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(service.getSiteMapOverview(1, controller.signal))
})
