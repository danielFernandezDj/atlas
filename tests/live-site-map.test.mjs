import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import ts from "typescript"
const compile = async (p) =>
  ts.transpileModule(await readFile(new URL(p, import.meta.url), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
const url = (s) =>
  `data:text/javascript;base64,${Buffer.from(s).toString("base64")}`
const contractsUrl = url(await compile("../lib/site-map/live-contracts.ts"))
const { portDisplay, matchesLastPort, canHealth, summarizeCanAssignments } =
  await import(contractsUrl)
const { readLiveCanMap, readBuildingMapSummary } = await import(
  url(
    (await compile("../lib/site-map/read-live.ts"))
      .replace('import "server-only";', "")
      .replace('"./live-contracts"', JSON.stringify(contractsUrl))
  )
)
const occupant = {
  id: 1,
  identity: 10,
  serial: "MINER-1",
  ip: "192.0.2.1",
  locationId: 9,
  locationKind: "DEPLOYMENT_SLOT",
}
const cell = {
  row: 0,
  column: 0,
  locationId: 9,
  code: "A",
  active: true,
  port: null,
  occupant,
  reservation: occupant,
  conflict: false,
}
const now = Date.parse("2026-11-02T12:00:00Z")
const telemetry = {
  hashRateThs: 100,
  expectedThs: 100,
  sleeping: false,
  sampledAt: new Date(now).toISOString(),
}
test("operational colors require fresh readings and preserve sleep and zero explicitly", () => {
  assert.deepEqual(portDisplay(cell, telemetry, now), {
    state: "hashing",
    text: "100",
  })
  assert.equal(
    portDisplay(cell, { ...telemetry, hashRateThs: 78 }, now).state,
    "slow"
  )
  assert.deepEqual(portDisplay(cell, { ...telemetry, hashRateThs: 0 }, now), {
    state: "zero",
    text: "0 H",
  })
  assert.deepEqual(
    portDisplay(cell, { ...telemetry, hashRateThs: 0, sleeping: true }, now),
    { state: "sleeping", text: "S" }
  )
  for (const t of [
    undefined,
    { ...telemetry, hashRateThs: null },
    { ...telemetry, hashRateThs: NaN },
    { ...telemetry, sampledAt: new Date(now - 121000).toISOString() },
  ])
    assert.equal(portDisplay(cell, t, now).state, "unknown")
})
test("empty, repair reservation, other reservation and conflicting occupancy are distinct", () => {
  assert.equal(
    portDisplay({ ...cell, occupant: null, reservation: null }).state,
    "empty"
  )
  assert.equal(
    portDisplay({
      ...cell,
      occupant: null,
      reservation: { ...occupant, locationKind: "REPAIR" },
    }).state,
    "repair"
  )
  assert.equal(portDisplay({ ...cell, occupant: null }).state, "reserved")
  assert.equal(
    portDisplay({ ...cell, conflict: true }, telemetry, now).state,
    "conflict"
  )
  assert.equal(portDisplay({ ...cell, active: false }).state, "inactive")
  assert.equal(
    portDisplay({
      ...cell,
      locationId: null,
      occupant: null,
      reservation: null,
    }).state,
    "unconfigured"
  )
})
const dbMiner = {
  id: 1,
  identify_miner_id: 10,
  serial_number: "MINER-1",
  miner_ip: "192.0.2.1",
  current_location_id: 9,
  current_location: { kind: "DEPLOYMENT_SLOT" },
}
const can = () => ({
  id: 2,
  can_number: "1",
  row_count: 11,
  slot_per_row: 35,
  is_active: true,
  building: { building_number: 1, is_active: true, site: { is_active: true } },
  locations: [
    {
      id: 9,
      code: "A",
      row_index: 0,
      slot_index: 0,
      is_active: true,
      current_miners: [dbMiner],
      slot_occupant: { id: 1 },
      ports: [
        {
          id: 1,
          port_number: "1",
          active: true,
          observed_mac: null,
          last_seen_at: null,
          switch: { name: "SW-1", active: true },
          reserved_miner: dbMiner,
        },
      ],
    },
  ],
})
test("map reads only the requested site/can and preserves zero-based 11 by 35 coordinates", async () => {
  let query
  const map = await readLiveCanMap(
    {
      can: {
        findFirst: async (args) => {
          query = args
          return can()
        },
      },
    },
    3,
    2
  )
  assert.deepEqual(query.where, { id: 2, building: { site_id: 3 } })
  assert.equal(map.cells.length, 385)
  assert.equal(map.cells[0].occupant.ip, "192.0.2.1")
  assert.equal(map.cells.at(-1).row, 10)
  assert.equal(map.cells.at(-1).column, 34)
  assert.equal(portDisplay(map.cells[0]).state, "unknown")
  assert.equal(portDisplay(map.cells[1]).state, "unconfigured")
})
test("repair reservations survive without occupancy and inconsistent occupants are flagged", async () => {
  const c = can()
  c.locations[0].current_miners = []
  c.locations[0].slot_occupant = null
  c.locations[0].ports[0].reserved_miner = {
    ...dbMiner,
    current_location_id: 99,
    current_location: { kind: "REPAIR" },
  }
  let map = await readLiveCanMap({ can: { findFirst: async () => c } }, 3, 2)
  assert.equal(portDisplay(map.cells[0]).state, "repair")
  assert.equal(map.cells[0].reservation.id, 1)
  c.locations[0].current_miners = [{ ...dbMiner, id: 2 }]
  c.locations[0].slot_occupant = { id: 2 }
  map = await readLiveCanMap({ can: { findFirst: async () => c } }, 3, 2)
  assert.equal(portDisplay(map.cells[0]).state, "conflict")
})
test("missing maps, bad layouts, read failures and out-of-range records are not fabricated", async () => {
  assert.equal(
    await readLiveCanMap({ can: { findFirst: async () => null } }, 3, 9),
    null
  )
  await assert.rejects(
    readLiveCanMap(
      {
        can: {
          findFirst: async () => {
            throw new Error("Offline")
          },
        },
      },
      3,
      9
    ),
    /Offline/
  )
  const c = can()
  c.row_count = 0
  await assert.rejects(
    readLiveCanMap({ can: { findFirst: async () => c } }, 3, 2),
    /dimensions/
  )
  c.row_count = 11
  c.locations[0].row_index = 12
  const map = await readLiveCanMap({ can: { findFirst: async () => c } }, 3, 2)
  assert.equal(map.issues.length, 1)
  assert.ok(map.cells.every((c) => c.locationId === null))
})
test("map endpoint authenticates before any map query and exposes no write methods", async () => {
  const source = await readFile(
    new URL("../app/api/site-map/route.ts", import.meta.url),
    "utf8"
  )
  assert.ok(
    source.indexOf("await minerReadAccess()") <
      source.indexOf("await readLiveCanMap(")
  )
  assert.match(source, /if \(denied\) return denied/)
  assert.doesNotMatch(source, /export async function (POST|PATCH|DELETE|PUT)/)
  assert.match(source, /no-store/)
})

test("building summary includes reserved repair miners without counting unrelated buildings", async () => {
  const calls = []
  const db = {
    $transaction: async (callback, options) => {
      assert.equal(options.isolationLevel, "RepeatableRead")
      return callback({
        buildings: {
          findFirst: async (args) => {
            assert.deepEqual(args.where, { id: 7, site_id: 3 })
            return {
              id: 7,
              building_number: 2,
              is_active: true,
              site: { is_active: true },
            }
          },
        },
        miner: {
          count: async (args) => {
            calls.push(args.where)
            return [14, 10, 2, 1, 1][calls.length - 1]
          },
        },
        can: {
          findMany: async (args) => {
            assert.deepEqual(args.where, { building_id: 7 })
            return [
              {
                id: 2,
                locations: [
                  {
                    current_miners: [{ id: 1 }],
                    ports: [{ reserved_miner_id: 1 }, { reserved_miner_id: 2 }],
                  },
                ],
              },
              { id: 3, locations: [] },
            ]
          },
        },
        port_index: {
          count: async (args) => {
            assert.deepEqual(args.where, {
              location: { building_id: 7 },
              reserved_miner_id: { not: null },
            })
            return 13
          },
        },
      })
    },
  }
  const summary = await readBuildingMapSummary(db, 3, 7)
  assert.equal(summary.linked, 14)
  assert.equal(summary.deployed, 10)
  assert.equal(summary.repair, 2)
  assert.equal(summary.reserved, 13)
  assert.deepEqual(summary.cans, [
    { id: 2, miners: 2, stage: "unknown", hashingPercent: null },
    { id: 3, miners: 0, stage: "empty", hashingPercent: null },
  ])
  const linked = {
    OR: [
      { current_location: { building_id: 7 } },
      { reserved_port: { location: { building_id: 7 } } },
    ],
  }
  assert.deepEqual(calls[0], linked)
  assert.deepEqual(calls[1], {
    current_location: { building_id: 7, kind: "DEPLOYMENT_SLOT" },
  })
  assert.deepEqual(calls[2], {
    AND: [linked, { current_location: { kind: "REPAIR" } }],
  })
})
test("missing building summary stops without inventory reads; failures remain failures", async () => {
  const db = {
    $transaction: async (callback) =>
      callback({
        buildings: { findFirst: async () => null },
        miner: {
          count: async () => {
            throw new Error("Should not query")
          },
        },
      }),
  }
  assert.equal(await readBuildingMapSummary(db, 1, 7), null)
  await assert.rejects(
    readBuildingMapSummary(
      {
        $transaction: async () => {
          throw new Error("Offline")
        },
      },
      1,
      7
    ),
    /Offline/
  )
})
test("building summary endpoint authenticates before querying and remains read-only", async () => {
  const source = await readFile(
    new URL("../app/api/site-map/building/route.ts", import.meta.url),
    "utf8"
  )
  assert.ok(
    source.indexOf("await minerReadAccess()") <
      source.indexOf("await readBuildingMapSummary(")
  )
  assert.match(source, /if \(denied\) return denied/)
  assert.doesNotMatch(source, /export async function (POST|PUT|PATCH|DELETE)/)
  assert.match(source, /no-store/)
})

test("last-port matching uses the can, coordinates and stable location identity", () => {
  const last = {
    siteId: 3,
    buildingId: 7,
    canId: 2,
    buildingNumber: 1,
    canNumber: "2",
    row: 0,
    column: 0,
    locationId: 9,
  }
  assert.equal(matchesLastPort(cell, 2, last), true)
  assert.equal(matchesLastPort(cell, 3, last), false)
  assert.equal(matchesLastPort({ ...cell, row: 1 }, 2, last), false)
  assert.equal(matchesLastPort({ ...cell, locationId: 10 }, 2, last), false)
  assert.equal(
    matchesLastPort({ ...cell, occupant: { ...occupant, id: 2 } }, 2, last),
    true
  )
  assert.equal(matchesLastPort(cell, 2, null), false)
  assert.equal(
    matchesLastPort({ ...cell, locationId: null }, 2, {
      ...last,
      locationId: null,
    }),
    true
  )
})

test("can health thresholds handle exact boundaries and require complete telemetry", () => {
  assert.equal(canHealth(100, 100, 100).stage, "healthy")
  assert.equal(canHealth(100, 95, 100).stage, "healthy")
  assert.equal(canHealth(100, 94, 100).stage, "warning")
  assert.equal(canHealth(100, 90, 100).stage, "warning")
  assert.equal(canHealth(100, 89, 100).stage, "critical")
  assert.equal(canHealth(100, 0, 100).stage, "critical")
  assert.equal(canHealth(0, null).stage, "empty")
  for (const args of [
    [10, null, 0],
    [10, 9, 9],
    [10, 11, 10],
    [10, -1, 10],
  ])
    assert.equal(canHealth(...args).stage, "unknown")
})
test("can counts include reserved repair miners but count a physical/reserved miner only once", () => {
  const result = summarizeCanAssignments({
    id: 1,
    locations: [
      {
        current_miners: [{ id: 1 }, { id: 2 }],
        ports: [
          { reserved_miner_id: 1 },
          { reserved_miner_id: 3 },
          { reserved_miner_id: null },
        ],
      },
    ],
  })
  assert.equal(result.miners, 3)
  assert.equal(result.stage, "unknown")
  assert.equal(result.hashingPercent, null)
})
