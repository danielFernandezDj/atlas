import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import ts from "typescript"

// Load the two pure TS modules without adding a test runtime dependency or generating repo files.
const compile = async (path) =>
  ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
const dataUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
const contractsUrl = dataUrl(await compile("../lib/miners/contracts.ts"))
const { locationPath } = await import(contractsUrl)
const mapUrl = dataUrl(await compile("../lib/site-map/model.ts"))
const adapterSource = (await compile("../lib/demo/miner-service.ts"))
  .replace('"../miners/contracts"', JSON.stringify(contractsUrl))
  .replace('"../site-map/model"', JSON.stringify(mapUrl))
const { createDemoMinerService } = await import(dataUrl(adapterSource))
const create = () => createDemoMinerService({ latency: 0 })
const query = { search: "", site_id: null, kind: "", page: 1, page_size: 6 }
const destinations = {
  site_id: 1,
  building_id: 11,
  can_id: 111,
  kind: "",
  page: 1,
  page_size: 10,
}
const command = (overrides = {}) => ({
  miner_id: 1,
  destination_location_id: 1113,
  reason: "RELOCATION",
  notes: "Demo movement note",
  expected_version: 2,
  submission_key: crypto.randomUUID(),
  ...overrides,
})
const code = (expected) => (error) => error.code === expected

test("search covers records outside the loaded page; filters/pagination are dataset-wide", async () => {
  const service = create()
  assert.equal((await service.searchMiners(query)).total, 32)
  assert.equal((await service.searchMiners({ ...query, site_id: 1 })).total, 7)
  assert.equal(
    (await service.searchMiners({ ...query, site_id: 1, page: 2 })).items[0]
      .serial_number,
    "ATLAS-1007"
  )
  assert.equal(
    (await service.searchMiners({ ...query, search: "ATLAS-1025" })).items[0]
      .id,
    25
  )
  assert.equal(
    (await service.searchMiners({ ...query, kind: "UNASSIGNED" })).total,
    4
  )
  assert.ok(
    (await service.searchMiners({ ...query, search: "ASSET-204" })).total > 1
  )
})
test("optional fields, company roles, full serials, and stored zero coordinates survive", async () => {
  const service = create()
  const { miner: noModel } = await service.getMiner(3)
  assert.equal(noModel.model, null)
  assert.equal(noModel.asset_tag, null)
  const { miner: same } = await service.getMiner(1),
    { miner: different } = await service.getMiner(2)
  assert.equal(same.owner.id, same.manager.id)
  assert.notEqual(different.owner.id, different.manager.id)
  const { miner: unassigned } = await service.getMiner(8)
  assert.equal(
    locationPath(unassigned.current_location),
    "Location not assigned"
  )
  assert.ok(unassigned.serial_number.endsWith("000000000008"))
  assert.match(
    locationPath({ ...same.current_location, row_index: 0, slot_index: 0 }),
    /Row 0 \/ Slot 0/
  )
  assert.match(
    locationPath({ ...same.current_location, building: null }),
    /Building unavailable/
  )
})
test("destinations retain full hierarchy, disable occupied slots, and exclude inactive ancestors", async () => {
  const service = create(),
    options = await service.getDestinations(1, destinations)
  assert.deepEqual(
    options.buildings.map((building) => building.id),
    [11]
  )
  assert.deepEqual(
    options.cans.map((can) => can.can_number),
    ["01"]
  )
  assert.equal(
    options.destinations.items.find((item) => item.location.id === 1111)
      .eligible,
    false
  )
  assert.match(
    options.destinations.items.find((item) => item.location.id === 1111)
      .unavailable_reason,
    /Occupied/
  )
  assert.equal(
    options.destinations.items.find((item) => item.location.id === 1112)
      .eligible,
    true
  )
  assert.ok(
    options.destinations.items.every(
      (item) =>
        item.location.site_id &&
        item.location.building_id &&
        item.location.can_id
    )
  )
  assert.equal(
    (
      await service.getDestinations(1, {
        ...destinations,
        building_id: 12,
        can_id: 121,
      })
    ).destinations.total,
    0
  )
  assert.equal(
    (await service.getMiner(7)).miner.current_location.is_active,
    false
  )
})
test("shared locations accept multiple miners; moves refresh version, notes, actor, and source", async () => {
  const service = create(),
    before = (await service.getMiner(1)).miner
  await service.move(command({ recorded_by_id: 999, from_location_id: 999 }))
  await service.move(command({ miner_id: 2 }))
  const after = (await service.getMiner(1)).miner
  assert.equal(after.version, before.version + 1)
  assert.equal(after.current_location.id, 1113)
  assert.equal((await service.getMiner(2)).miner.current_location.id, 1113)
  const history = await service.getHistory(1, 1, 5)
  assert.equal(history.total, 3)
  assert.equal(history.items[0].notes, "Demo movement note")
  assert.equal(history.items[0].recorded_by.id, 1)
  assert.equal(history.items[0].from_location.id, before.current_location.id)
  assert.equal(history.items.at(-1).from_location, null)
  assert.notEqual(
    history.items.at(-1).occurred_at,
    history.items.at(-1).recorded_at
  )
})
test("slot conflicts and forbidden/invalid moves leave both miner and history unchanged", async () => {
  const service = create()
  await assert.rejects(
    service.move(command({ destination_location_id: 1111 })),
    code("SLOT_OCCUPIED")
  )
  await assert.rejects(
    service.move(command({ miner_id: 4, destination_location_id: 1114 })),
    code("FORBIDDEN")
  )
  await assert.rejects(
    service.move(command({ reason: "STORAGE" })),
    code("INVALID")
  )
  await assert.rejects(
    service.move(command({ destination_location_id: 1215 })),
    code("INVALID")
  )
  assert.equal((await service.getMiner(1)).miner.version, 2)
  assert.equal((await service.getHistory(1, 1, 5)).total, 2)
})
test("version conflict preserves the other movement and does not replay the stale move", async () => {
  const service = create()
  service.demo.simulateConcurrentMove(1)
  await assert.rejects(
    service.move(command({ destination_location_id: 1115 })),
    code("VERSION_CONFLICT")
  )
  assert.equal((await service.getMiner(1)).miner.version, 3)
  assert.equal(
    (await service.getHistory(1, 1, 5)).items[0].recorded_by.name,
    "Jordan Lee"
  )
})
test("a slot claimed after listing is rejected when saving", async () => {
  const service = create()
  assert.equal(
    (await service.getDestinations(1, destinations)).destinations.items.find(
      (item) => item.location.id === 1112
    ).eligible,
    true
  )
  service.demo.occupySlot(1112)
  await assert.rejects(
    service.move(command({ destination_location_id: 1112 })),
    code("SLOT_OCCUPIED")
  )
})
test("lost acknowledgement retries exactly once; changed payload cannot reuse its key", async () => {
  const service = create(),
    draft = command()
  service.demo.loseNextAcknowledgement()
  await assert.rejects(service.move(draft), code("NETWORK"))
  const confirmed = await service.move(draft),
    repeated = await service.move(draft)
  assert.equal(confirmed.movement_id, repeated.movement_id)
  const reordered = Object.fromEntries(Object.entries(draft).reverse())
  assert.equal(
    (await service.move(reordered)).movement_id,
    confirmed.movement_id
  )
  assert.equal((await service.getHistory(1, 1, 5)).total, 3)
  assert.equal((await service.getMiner(1)).miner.version, 3)
  await assert.rejects(
    service.move({ ...draft, notes: "changed" }),
    code("INVALID")
  )
  await assert.rejects(
    service.move({
      ...draft,
      submission_key: crypto.randomUUID(),
      destination_location_id: 1115,
    }),
    code("VERSION_CONFLICT")
  )
})
test("read errors are recoverable and aborted queries do not resolve as successful reads", async () => {
  const service = create()
  service.demo.failNextRead()
  await assert.rejects(service.searchMiners(query), code("NETWORK"))
  assert.equal((await service.searchMiners(query)).total, 32)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(service.searchMiners(query, controller.signal), {
    name: "AbortError",
  })
})

const registration = (overrides = {}) => ({
  serial_number: "DEMO-REG-001",
  asset_tag: null,
  model_id: null,
  owner_company_id: 2,
  management_company_id: 1,
  initial_location_id: null,
  notes: null,
  submission_key: crypto.randomUUID(),
  ...overrides,
})
test("registration choices include existing models, separate companies, and full location hierarchy", async () => {
  const service = create(),
    options = await service.getRegistrationOptions(destinations)
  assert.equal(options.can_register, true)
  assert.equal(options.models[0].manufacturer, "Bitmain")
  assert.equal(options.models[0].variant, "Pro")
  assert.equal(options.companies.length, 3)
  assert.deepEqual(
    options.locations.buildings.map((building) => building.id),
    [11]
  )
  assert.equal(
    options.locations.destinations.items.find(
      (item) => item.location.id === 1110
    ).eligible,
    false
  )
})
test("registration without location supports optional model/tag and creates no movement", async () => {
  const service = create(),
    initialHistory = service.dashboardHistory().length
  const { miner } = await service.registerMiner(
    registration({ serial_number: "  Case-Sensitive-Serial-0000000000009  " })
  )
  assert.equal(miner.serial_number, "Case-Sensitive-Serial-0000000000009")
  assert.equal(miner.asset_tag, null)
  assert.equal(miner.model, null)
  assert.equal(miner.owner.name, "Summit Mining")
  assert.equal(miner.manager.name, "Atlas Operations")
  assert.equal(miner.current_location, null)
  assert.equal(miner.version, 0)
  assert.equal((await service.getHistory(miner.id, 1, 5)).total, 0)
  assert.equal(service.dashboardHistory().length, initialHistory)
  assert.equal(
    (await service.searchMiners({ ...query, search: miner.serial_number }))
      .items[0].id,
    miner.id
  )
})
test("registration with location records exact INITIAL_REGISTRATION, notes, and authenticated demo actor", async () => {
  const service = create()
  const draft = registration({
    initial_location_id: 1112,
    model_id: 1,
    asset_tag: "ASSET-204",
    notes: "Initial slot placement",
    owner_company_id: 1,
    management_company_id: 1,
    recorded_by_id: 999,
  })
  const { miner } = await service.registerMiner(draft)
  assert.equal(miner.current_location.id, 1112)
  assert.equal(miner.version, 1)
  assert.deepEqual(miner.model, {
    manufacturer: "Bitmain",
    name: "Antminer S19",
    variant: "Pro",
  })
  assert.equal(miner.owner.id, miner.manager.id)
  const movement = (await service.getHistory(miner.id, 1, 5)).items[0]
  assert.equal(movement.reason, "INITIAL_REGISTRATION")
  assert.equal(movement.from_location, null)
  assert.equal(movement.to_location.id, 1112)
  assert.equal(movement.notes, "Initial slot placement")
  assert.equal(movement.recorded_by.id, 1)
  assert.equal(movement.submission_key, draft.submission_key)
  assert.equal(
    (
      await service.getRegistrationOptions(destinations)
    ).locations.destinations.items.find((item) => item.location.id === 1112)
      .eligible,
    false
  )
})
test("registration rejects duplicate serials, occupied/inactive locations, and invalid company/model records without partial writes", async () => {
  const service = create(),
    initialHistory = service.dashboardHistory().length
  await assert.rejects(
    service.registerMiner(registration({ serial_number: "ATLAS-1001" })),
    code("DUPLICATE_SERIAL")
  )
  await assert.rejects(
    service.registerMiner(registration({ initial_location_id: 1110 })),
    code("SLOT_OCCUPIED")
  )
  await assert.rejects(
    service.registerMiner(registration({ initial_location_id: 1215 })),
    code("INVALID")
  )
  await assert.rejects(
    service.registerMiner(registration({ owner_company_id: 999 })),
    code("INVALID")
  )
  await assert.rejects(
    service.registerMiner(registration({ management_company_id: 999 })),
    code("INVALID")
  )
  await assert.rejects(
    service.registerMiner(registration({ model_id: 999 })),
    code("INVALID")
  )
  await assert.rejects(
    service.registerMiner(
      registration({ notes: "Unsupported miner note without a movement" })
    ),
    code("INVALID")
  )
  await assert.rejects(
    service.registerMiner(registration({ serial_number: "  " })),
    code("INVALID")
  )
  assert.equal((await service.searchMiners(query)).total, 32)
  assert.equal(service.dashboardHistory().length, initialHistory)
})
test("registrations may share an asset tag and a shared physical location", async () => {
  const service = create()
  const one = await service.registerMiner(
    registration({
      serial_number: "DEMO-ONE",
      asset_tag: "ASSET-204",
      initial_location_id: 1115,
    })
  )
  const two = await service.registerMiner(
    registration({
      serial_number: "DEMO-TWO",
      asset_tag: "ASSET-204",
      initial_location_id: 1115,
    })
  )
  assert.equal(one.miner.asset_tag, two.miner.asset_tag)
  assert.equal(one.miner.current_location.id, two.miner.current_location.id)
})
test("registration retry is idempotent after a lost response, with or without a movement", async () => {
  for (const destination of [null, 1112]) {
    const service = create(),
      draft = registration({ initial_location_id: destination })
    service.demo.loseNextAcknowledgement()
    await assert.rejects(service.registerMiner(draft), code("NETWORK"))
    const one = await service.registerMiner(draft),
      two = await service.registerMiner(
        Object.fromEntries(Object.entries(draft).reverse())
      )
    assert.equal(one.miner.id, two.miner.id)
    assert.equal((await service.searchMiners(query)).total, 33)
    assert.equal(
      (await service.getHistory(one.miner.id, 1, 5)).total,
      destination ? 1 : 0
    )
    await assert.rejects(
      service.registerMiner({ ...draft, serial_number: "CHANGED" }),
      code("INVALID")
    )
  }
})
test("concurrent registrations cannot duplicate a serial or claim the same slot", async () => {
  const service = create()
  const serialRace = await Promise.allSettled([
    service.registerMiner(registration()),
    service.registerMiner(registration()),
  ])
  assert.equal(
    serialRace.filter((result) => result.status === "fulfilled").length,
    1
  )
  assert.equal(
    serialRace.find((result) => result.status === "rejected").reason.code,
    "DUPLICATE_SERIAL"
  )
  const slotRace = await Promise.allSettled([
    service.registerMiner(
      registration({ serial_number: "SLOT-ONE", initial_location_id: 1112 })
    ),
    service.registerMiner(
      registration({ serial_number: "SLOT-TWO", initial_location_id: 1112 })
    ),
  ])
  assert.equal(
    slotRace.filter((result) => result.status === "fulfilled").length,
    1
  )
  assert.equal(
    slotRace.find((result) => result.status === "rejected").reason.code,
    "SLOT_OCCUPIED"
  )
  assert.equal((await service.searchMiners(query)).total, 34)
})
