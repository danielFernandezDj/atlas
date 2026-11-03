import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import ts from "typescript"

const compile = async (relative) =>
  ts.transpileModule(
    await readFile(new URL(relative, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText
const url = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
const contracts = url(await compile("../lib/miners/inventory-contracts.ts"))
const source = (await compile("../lib/miners/read-inventory.ts"))
  .replace('import "server-only";', "")
  .replace('"./inventory-contracts"', JSON.stringify(contracts))
const {
  parseInventoryQuery,
  parseMinerId,
  readMinerInventory,
  readMinerInventoryDetail,
} = await import(url(source))

const location = {
  id: 9,
  name: "Workshop",
  code: "REPAIR",
  kind: "REPAIR",
  is_active: true,
  site: { name: "South", is_active: true },
  building: null,
  can: null,
  row_index: null,
  slot_index: null,
}
const row = {
  id: 42,
  identify_miner_id: 90042,
  serial_number: "ENCLOSURE-42",
  asset_tag: null,
  model: null,
  owner: { name: "Owner" },
  manager: { name: "Manager" },
  current_location: location,
  _count: { hash_boards: 2 },
}

test("directory parameters reject malformed IDs, oversized pages, repeated filters and unsupported kinds", () => {
  for (const value of [
    "site=0",
    "site=-1",
    "site=1.1",
    "page=0",
    "pageSize=1000",
    "kind=HEALTHY",
    "site=1&site=2",
    "search=" + "x".repeat(201),
  ]) {
    assert.throws(() => parseInventoryQuery(new URLSearchParams(value)))
  }
  for (const value of ["0", "-1", "1 OR 1=1", "2147483648"])
    assert.throws(() => parseMinerId(value))
  assert.equal(parseMinerId("42"), 42)
})

test("site and kind restrictions are ANDed with database-wide search before pagination", async () => {
  const query = parseInventoryQuery(
    new URLSearchParams("site=2&kind=REPAIR&search=90042&page=2&pageSize=12")
  )
  let where
  const db = {
    $transaction: async (callback, options) => {
      assert.equal(options.isolationLevel, "RepeatableRead")
      return callback({
        miner: {
          count: async (args) => {
            where = args.where
            return 25
          },
          findMany: async (args) => {
            assert.equal(args.where, where)
            assert.equal(args.skip, 12)
            assert.equal(args.take, 12)
            assert.deepEqual(args.orderBy, [
              { identify_miner_id: "asc" },
              { id: "asc" },
            ])
            assert.deepEqual(args.where.AND.slice(0, 2), [
              { current_location: { kind: "REPAIR" } },
              { current_location: { site_id: 2 } },
            ])
            assert.ok(
              args.where.AND[2].OR.some(
                (filter) => filter.identify_miner_id === 90042
              )
            )
            return [row]
          },
        },
      })
    },
  }
  const page = await readMinerInventory(db, query)
  assert.equal(page.total, 25)
  assert.equal(page.page, 2)
  assert.equal(page.items[0].identity, 90042)
  assert.match(page.items[0].location.label, /South \/ Workshop/)
  assert.doesNotMatch(page.items[0].location.label, /undefined|null|Can/)
  assert.equal(page.items[0].location.active, true)
  assert.equal(page.items[0].hashboards, 2)
})

test("deleted rows clamp the requested page and unassigned filtering handles null locations", async () => {
  const query = parseInventoryQuery(
    new URLSearchParams("kind=UNASSIGNED&page=999")
  )
  const db = {
    $transaction: async (fn) =>
      fn({
        miner: {
          count: async () => 0,
          findMany: async (args) => {
            assert.equal(args.skip, 0)
            assert.deepEqual(args.where.AND, [{ current_location_id: null }])
            return []
          },
        },
      }),
  }
  assert.deepEqual(await readMinerInventory(db, query), {
    items: [],
    total: 0,
    page: 1,
    pageSize: 12,
  })
})

test("miner details preserve missing fields, two-board positions, reservations and automated history", async () => {
  const db = {
    miner: {
      findUnique: async (args) => {
        assert.deepEqual(args.where, { id: 42 })
        assert.equal(args.select.movements.take, 20)
        assert.equal(args.select.history.take, 20)
        assert.deepEqual(args.select.history.where, { dateDeleted: null })
        return {
          ...row,
          miner_ip: null,
          last_api_ip: null,
          dateCreated: new Date("2026-11-01T00:00:00Z"),
          dateUpdated: new Date("2026-11-02T00:00:00Z"),
          skeleton: null,
          control_board: {
            id: 4,
            serial_number: null,
            condition: "GOOD",
            mac_address: "00:11:22:33:44:55",
            firmware_version: null,
          },
          hash_boards: [
            {
              id: 11,
              serial_number: "HB-A",
              condition: "GOOD",
              position: "SLOT_1",
            },
            {
              id: 13,
              serial_number: "HB-C",
              condition: "FAULTY",
              position: "SLOT_3",
            },
          ],
          reserved_port: {
            port_number: "7",
            switch: { name: "Switch A" },
            location,
          },
          movements: [
            {
              id: 1,
              reason: "REPAIR",
              source: "NETWORK",
              notes: null,
              occurred_at: new Date("2026-11-02T00:00:00Z"),
              recorded_by: null,
              from_location: null,
              to_location: location,
            },
          ],
          history: [
            {
              id: 2,
              kind: "COMPONENT_REMOVED",
              source: "SYSTEM",
              notes: null,
              occurred_at: new Date("2026-11-02T00:00:00Z"),
              user: null,
              skeleton_id: null,
              control_board_id: null,
              hash_board_id: 12,
              position: "SLOT_2",
            },
          ],
          _count: { hash_boards: 2, movements: 30, history: 40 },
        }
      },
    },
  }
  const result = await readMinerInventoryDetail(db, 42)
  assert.equal(result.skeleton, null)
  assert.equal(result.controlBoard.firmware, null)
  assert.deepEqual(
    result.boards.map((board) => board.position),
    ["SLOT_1", "SLOT_3"]
  )
  assert.equal(result.movements[0].by, "network integration")
  assert.equal(result.movements[0].from, "Not assigned")
  assert.equal(result.events[0].component, "Hashboard #12 · Position 2")
  assert.equal(result.movementCount, 30)
  assert.equal(result.eventCount, 40)
  assert.equal(result.reservation.port, "7")
  assert.doesNotThrow(() => JSON.stringify(result))
})

test("missing miners and unavailable databases never masquerade as an empty successful record", async () => {
  assert.equal(
    await readMinerInventoryDetail(
      { miner: { findUnique: async () => null } },
      42
    ),
    null
  )
  await assert.rejects(
    readMinerInventory(
      {
        $transaction: async () => {
          throw new Error("Offline")
        },
      },
      parseInventoryQuery(new URLSearchParams())
    ),
    /Offline/
  )
})

test("deployment locations show coordinates once even when the name repeats the hierarchy", async () => {
  const slot = {
    ...location,
    kind: "DEPLOYMENT_SLOT",
    name: "South Building 1 Can 2 Row 3 Slot 4",
    code: "SLOT-4",
    building: { building_number: 1, is_active: true },
    can: { can_number: 2, is_active: true },
    row_index: 3,
    slot_index: 4,
  }
  const db = {
    $transaction: async (callback) =>
      callback({
        miner: {
          count: async () => 1,
          findMany: async () => [{ ...row, current_location: slot }],
        },
      }),
  }
  const result = await readMinerInventory(
    db,
    parseInventoryQuery(new URLSearchParams())
  )
  assert.equal(
    result.items[0].location.label,
    "South / Building 1 / Can 2 / Row 3 / Slot 4 (SLOT-4)"
  )
})
