import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import ts from "typescript"

const source = ts
  .transpileModule(
    await readFile(
      new URL("../lib/dashboard/read.ts", import.meta.url),
      "utf8"
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }
  )
  .outputText.replace('import "server-only";', "")
const { readDashboard } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
)
const identity = { email: "staff@example.test", emailVerified: true }

function database({
  staff = {
    first_name: "Alex",
    last_name: "Doe",
    role: "TECHNICIAN",
    is_active: true,
  },
  sites = [
    { id: 1, name: "North", description: null, is_active: true },
    { id: 2, name: "South", description: "Second site", is_active: true },
  ],
  expectedSite = 2,
  fail = false,
} = {}) {
  const calls = []
  const scoped = (method, args, id) => {
    calls.push({ method, args })
    assert.equal(id, expectedSite)
  }
  const db = {
    users: {
      findUnique: async (args) => {
        calls.push({ method: "users", args })
        return staff
      },
    },
    $transaction: async (fn, options) => {
      calls.push({ method: "transaction", options })
      if (fail) throw new Error("Database unavailable")
      return fn({
        sites: { findMany: async () => sites },
        miner: {
          count: async (args) => {
            scoped(
              "miner",
              args,
              (args.where.current_location ?? args.where.occupied_slot).site_id
            )
            return args.where.occupied_slot
              ? 3
              : { DEPLOYMENT_SLOT: 3, REPAIR: 2, STAGING: 1, PALLET: 4 }[
                  args.where.current_location.kind
                ]
          },
        },
        locations: {
          count: async (args) => {
            scoped("locations", args, args.where.site_id)
            return 15
          },
        },
        port_index: {
          count: async (args) => {
            scoped("ports", args, args.where.location.site_id)
            assert.deepEqual(args.where.reserved_miner_id, { not: null })
            return 5
          },
        },
        ...Object.fromEntries(
          ["skeleton", "control_boards", "hash_boards"].map((name) => [
            name,
            {
              count: async (args) => {
                scoped(name, args, args.where.miner.current_location.site_id)
                return name === "hash_boards" ? 20 : 10
              },
            },
          ])
        ),
        buildings: {
          findMany: async (args) => {
            scoped("buildings", args, args.where.site_id)
            return [
              {
                id: 21,
                building_number: 1,
                is_active: true,
                cans: [
                  {
                    id: 211,
                    can_number: "01",
                    is_active: false,
                    _count: { locations: 15 },
                  },
                ],
              },
            ]
          },
        },
        miner_movements: {
          findMany: async (args) => {
            calls.push({ method: "movements", args })
            assert.deepEqual(args.where.OR, [
              { from_location: { site_id: expectedSite } },
              { to_location: { site_id: expectedSite } },
            ])
            assert.equal(args.take, 20)
            assert.deepEqual(args.orderBy, [
              { occurred_at: "desc" },
              { id: "desc" },
            ])
            return [
              {
                id: 1,
                reason: "INITIAL_REGISTRATION",
                source: "NETWORK",
                occurred_at: new Date("2026-11-02T12:00:00Z"),
                miner: {
                  id: 42,
                  identify_miner_id: 10042,
                  serial_number: "ENCLOSURE-42",
                },
                from_location: null,
                to_location: {
                  name: "Repair",
                  code: "REPAIR",
                  site: { name: "South" },
                },
                recorded_by: null,
              },
            ]
          },
        },
      })
    },
  }
  return { db, calls }
}

test("site dashboard scopes every count, component and cross-site movement query to the selected site", async () => {
  const { db, calls } = database()
  const result = await readDashboard(db, identity, "2")
  assert.equal(result.status, "ready")
  assert.equal(result.dashboard.selectedSite.id, 2)
  assert.deepEqual(result.dashboard.summary, {
    miners: 10,
    deployed: 3,
    repair: 2,
    staging: 1,
    pallet: 4,
    slots: 15,
    occupied: 3,
    reserved: 5,
    skeletons: 10,
    controlBoards: 10,
    hashBoards: 20,
  })
  assert.equal(result.dashboard.buildings[0].cans[0].active, false)
  assert.equal(result.dashboard.movements[0].by, "network integration")
  assert.equal(result.dashboard.movements[0].from, "Not assigned")
  assert.equal(
    result.dashboard.movements[0].occurredAt,
    "2026-11-02T12:00:00.000Z"
  )
  assert.equal(
    calls.find((call) => call.method === "transaction").options.isolationLevel,
    "RepeatableRead"
  )
  assert.doesNotThrow(() => JSON.stringify(result))
})

test("unverified identities cannot use a staff email to read inventory", async () => {
  const { db, calls } = database()
  assert.deepEqual(
    await readDashboard(db, { ...identity, emailVerified: false }),
    { status: "verify-email" }
  )
  assert.equal(calls.length, 0)
})

test("missing or inactive staff accounts never run inventory queries", async () => {
  for (const staff of [null, { is_active: false }]) {
    const { db, calls } = database({ staff })
    assert.deepEqual(await readDashboard(db, identity), { status: "denied" })
    assert.deepEqual(
      calls.map((call) => call.method),
      ["users"]
    )
  }
})

test("unknown, malformed and repeated site parameters never query another site's inventory", async () => {
  for (const site of [
    "999",
    "NaN",
    "1 OR 1=1",
    "0",
    "1.5",
    ["1", "2"],
    "9007199254740993",
  ]) {
    const { db, calls } = database()
    const result = await readDashboard(db, identity, site)
    assert.equal(result.dashboard.siteUnavailable, true)
    assert.equal(result.dashboard.summary, null)
    assert.deepEqual(
      calls.map((call) => call.method),
      ["users", "transaction"]
    )
  }
})

test("initial load picks the first available site, and no-site state is distinct from zero counts", async () => {
  const first = database({ expectedSite: 1 })
  assert.equal(
    (await readDashboard(first.db, identity)).dashboard.selectedSite.id,
    1
  )
  const empty = database({ sites: [] })
  const result = await readDashboard(empty.db, identity)
  assert.equal(result.dashboard.siteUnavailable, false)
  assert.equal(result.dashboard.selectedSite, null)
  assert.equal(result.dashboard.summary, null)
})

test("database failures propagate to the retry boundary rather than becoming empty inventory", async () => {
  const { db } = database({ fail: true })
  await assert.rejects(readDashboard(db, identity, "2"), /Database unavailable/)
})
