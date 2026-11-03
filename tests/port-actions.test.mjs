import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
import ts from "typescript"
const require = createRequire(import.meta.url)
const compile = async (path) =>
  ts
    .transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    })
    .outputText.replace('import "server-only";', "")
const uri = (text) =>
  `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`
const zod = JSON.stringify(pathToFileURL(require.resolve("zod")).href)
const inventoryContracts = uri(
  (await compile("../lib/inventory-actions/contracts.ts")).replace('"zod"', zod)
)
const inventoryRead = uri(
  (await compile("../lib/inventory-actions/read.ts")).replace(
    '"./contracts"',
    JSON.stringify(inventoryContracts)
  )
)
const inventoryWrite = uri(
  (await compile("../lib/inventory-actions/write.ts"))
    .replace('"./contracts"', JSON.stringify(inventoryContracts))
    .replace('"./read"', JSON.stringify(inventoryRead))
)
const contracts = uri(
  (await compile("../lib/port-actions/contracts.ts")).replace('"zod"', zod)
)
const reader = uri(
  (await compile("../lib/port-actions/read.ts"))
    .replace(
      '"@/lib/inventory-actions/contracts"',
      JSON.stringify(inventoryContracts)
    )
    .replace('"@/lib/inventory-actions/read"', JSON.stringify(inventoryRead))
)
const writer = uri(
  (await compile("../lib/port-actions/write.ts"))
    .replace(
      '"@/lib/inventory-actions/contracts"',
      JSON.stringify(inventoryContracts)
    )
    .replace('"@/lib/inventory-actions/read"', JSON.stringify(inventoryRead))
    .replace('"@/lib/inventory-actions/write"', JSON.stringify(inventoryWrite))
    .replace('"./read"', JSON.stringify(reader))
    .replace('"./contracts"', JSON.stringify(contracts))
)
const { portCommandSchema } = await import(contracts)
const { readPortDetail, readPortDestinations } = await import(reader)
const { performPortAction } = await import(writer)
const baseLocation = {
  is_active: true,
  site_id: 1,
  site: { name: "Rebel", is_active: true },
  building: { building_number: 1, is_active: true },
  can: { can_number: "1", is_active: true },
  row_index: 0,
  slot_index: 4,
  name: "Port location",
  code: "B1-C1-R00-S04",
}
function inventory({
  occupied = true,
  reserved = true,
  active = true,
  role = "TECHNICIAN",
  minerActive = true,
  failSerialization = false,
} = {}) {
  let state = {
    locations: [
      { ...baseLocation, id: 10, kind: "DEPLOYMENT_SLOT" },
      { ...baseLocation, id: 11, slot_index: 5, kind: "DEPLOYMENT_SLOT" },
      {
        ...baseLocation,
        id: 20,
        kind: "REPAIR",
        name: "Workshop",
        code: "REPAIR",
        building: null,
        can: null,
        row_index: null,
        slot_index: null,
      },
      {
        ...baseLocation,
        id: 40,
        kind: "PALLET",
        name: "Pallet",
        code: "PALLET",
        building: null,
        can: null,
        row_index: null,
        slot_index: null,
      },
    ],
    miners: [
      {
        id: 1,
        identify_miner_id: 101,
        serial_number: "OLD",
        version: 0,
        current_location_id: occupied ? 10 : 20,
        occupied_slot_id: occupied ? 10 : null,
      },
      {
        id: 2,
        identify_miner_id: 102,
        serial_number: "NEW",
        version: 0,
        current_location_id: 40,
        occupied_slot_id: null,
      },
      {
        id: 99,
        identify_miner_id: 199,
        serial_number: "REPAIR-OCCUPANT",
        version: 0,
        current_location_id: 20,
        occupied_slot_id: null,
      },
    ],
    ports: [
      {
        id: 100,
        location_id: 10,
        active,
        reserved_miner_id: reserved ? 1 : null,
        switch: { name: "SW01", active: true },
      },
      {
        id: 101,
        location_id: 11,
        active: true,
        reserved_miner_id: null,
        switch: { name: "SW02", active: true },
      },
    ],
    movements: [],
    history: [],
    audits: [],
  }
  let attempts = 0
  return {
    snapshot: () => structuredClone(state),
    mutate: (fn) => fn(state),
    $transaction: async (fn, options) => {
      assert.equal(options.isolationLevel, "Serializable")
      attempts++
      const draft = structuredClone(state)
      function location(id) {
        const raw = draft.locations.find((l) => l.id === id)
        if (!raw) return null
        return {
          ...raw,
          current_miners: draft.miners
            .filter((m) => m.current_location_id === id)
            .map(enrich),
          slot_occupant:
            draft.miners.find((m) => m.occupied_slot_id === id) ?? null,
          ports: draft.ports
            .filter((p) => p.location_id === id)
            .map((p) => ({
              ...p,
              reserved_miner: enrich(
                draft.miners.find((m) => m.id === p.reserved_miner_id)
              ),
            })),
        }
      }
      function enrich(m) {
        return m
          ? {
              ...m,
              current_location:
                draft.locations.find((l) => l.id === m.current_location_id) ??
                null,
              reserved_port:
                draft.ports.find((p) => p.reserved_miner_id === m.id) ?? null,
              history: m.scrap ? [{ id: 1 }] : [],
            }
          : null
      }
      const tx = {
        $queryRaw: async () => [],
        users: { findUnique: async () => ({ is_active: minerActive, role }) },
        audit_log: {
          findFirst: async (q) =>
            draft.audits.find(
              (a) => a.details.submissionKey === q.where.details.equals
            ) ?? null,
          create: async ({ data }) => draft.audits.push(data),
        },
        locations: { findUnique: async ({ where }) => location(where.id) },
        miner: {
          findUnique: async ({ where }) =>
            enrich(draft.miners.find((m) => m.id === where.id)),
          findFirst: async ({ where }) =>
            draft.miners.find(
              (m) =>
                m.id !== where.id?.not &&
                where.OR.some((filter) =>
                  Object.entries(filter).every(
                    ([key, value]) => m[key] === value
                  )
                )
            ) ?? null,
          updateMany: async ({ where, data }) => {
            const m = draft.miners.find(
              (m) => m.id === where.id && m.version === where.version
            )
            if (!m) return { count: 0 }
            const { version, ...fields } = data
            Object.assign(m, fields)
            if (version?.increment) m.version += version.increment
            return { count: 1 }
          },
        },
        port_index: {
          findUnique: async ({ where }) =>
            draft.ports.find((p) => p.location_id === where.location_id) ??
            null,
          update: async ({ where, data }) => {
            const p = draft.ports.find((p) => p.id === where.id)
            Object.assign(p, data)
            return p
          },
          updateMany: async ({ where, data }) => {
            let count = 0
            for (const p of draft.ports) {
              if (
                where.reserved_miner_id !== undefined &&
                p.reserved_miner_id !== where.reserved_miner_id
              )
                continue
              if (typeof where.id === "number" && p.id !== where.id) continue
              if (where.id?.not === p.id) continue
              if (
                where.OR &&
                !where.OR.some((filter) =>
                  Object.entries(filter).every(
                    ([key, value]) => p[key] === value
                  )
                )
              )
                continue
              Object.assign(p, data)
              count++
            }
            return { count }
          },
        },
        miner_movements: {
          create: async ({ data }) => draft.movements.push(data),
        },
        miner_history: { create: async ({ data }) => draft.history.push(data) },
      }
      const result = await fn(tx)
      if (failSerialization && attempts === 1)
        throw Object.assign(new Error("retry transaction"), { code: "P2034" })
      state = draft
      return result
    },
    detail: () => {
      const l = state.locations.find((l) => l.id === 10),
        p = state.ports[0]
      const rows = state.miners.filter((m) => m.current_location_id === 10)
      const enrich = (m) =>
        m
          ? {
              ...m,
              current_location: state.locations.find(
                (l) => l.id === m.current_location_id
              ),
            }
          : null
      return {
        ...l,
        current_miners: rows.map(enrich),
        slot_occupant:
          state.miners.find((m) => m.occupied_slot_id === 10) ?? null,
        ports: [
          {
            ...p,
            reserved_miner: enrich(
              state.miners.find((m) => m.id === p.reserved_miner_id)
            ),
          },
        ],
      }
    },
  }
}
const key = "10000000-0000-4000-8000-000000000001"
async function command(db, operation, changes = {}) {
  const detail = await readPortDetail(
    { locations: { findUnique: async () => db.detail() } },
    10
  )
  return portCommandSchema.parse({
    operation,
    locationId: 10,
    snapshot: detail.snapshot,
    incoming: null,
    disposition: "UNASSIGNED",
    destinationId: null,
    keepReservation: false,
    notes: "Technician checked this port",
    submissionKey: key,
    ...changes,
  })
}
test("port notes, incoming selection, destination and reservation choices are validated", async () => {
  const db = inventory(),
    valid = await command(db, "disable")
  assert.equal(portCommandSchema.safeParse(valid).success, true)
  for (const c of [
    { ...valid, notes: "" },
    { ...valid, operation: "replace" },
    { ...valid, operation: "pull", disposition: "REPAIR" },
    { ...valid, keepReservation: true },
    { ...valid, destinationId: 20 },
    { ...valid, actorId: 999 },
  ])
    assert.equal(portCommandSchema.safeParse(c).success, false)
})
test("disabling an occupied port unassigns only its miner, clears the reservation and records the actor and reason", async () => {
  const db = inventory(),
    cmd = await command(db, "disable")
  await performPortAction(db, 7, cmd)
  const s = db.snapshot()
  assert.equal(s.ports[0].active, false)
  assert.equal(s.ports[0].reserved_miner_id, null)
  assert.equal(s.miners[0].current_location_id, null)
  assert.equal(s.miners[0].occupied_slot_id, null)
  assert.equal(s.miners[1].current_location_id, 40)
  assert.equal(s.history[0].user_id, 7)
  assert.equal(s.history[0].notes, cmd.notes)
  assert.equal(s.history[0].details.operation, "disable")
  assert.equal(s.audits[0].action, "PORT_DISABLE")
  assert.equal(s.movements.length, 0)
  const saved = db.snapshot()
  await performPortAction(db, 7, cmd)
  assert.deepEqual(db.snapshot(), saved)
})
test("disabling or releasing a repair reservation preserves the miner’s repair location", async () => {
  for (const operation of ["disable", "release"]) {
    const db = inventory({ occupied: false }),
      cmd = await command(db, operation)
    await performPortAction(db, 7, cmd)
    const s = db.snapshot()
    assert.equal(s.ports[0].reserved_miner_id, null)
    assert.equal(s.miners[0].current_location_id, 20)
    assert.equal(s.movements.length, 0)
    assert.equal(s.history[0].details.after.locationId, 20)
  }
})
test("pulling to an occupied shared repair area can keep the port reserved", async () => {
  const db = inventory(),
    cmd = await command(db, "pull", {
      disposition: "REPAIR",
      destinationId: 20,
      keepReservation: true,
    })
  await performPortAction(db, 7, cmd)
  const s = db.snapshot()
  assert.equal(s.miners[0].current_location_id, 20)
  assert.equal(s.miners[0].occupied_slot_id, null)
  assert.equal(s.ports[0].reserved_miner_id, 1)
  assert.equal(s.ports[0].active, true)
  assert.equal(s.movements[0].reason, "REPAIR")
  assert.equal(s.movements[0].recorded_by_id, 7)
})
test("disconnecting releases the reservation and records an unassignment without inventing a destination", async () => {
  const db = inventory()
  await performPortAction(db, 7, await command(db, "pull"))
  const s = db.snapshot()
  assert.equal(s.miners[0].current_location_id, null)
  assert.equal(s.ports[0].reserved_miner_id, null)
  assert.equal(s.movements.length, 0)
  assert.equal(s.history[0].details.after.locationId, null)
})
test("replacement moves the outgoing miner and incoming miner atomically with reservation history", async () => {
  const db = inventory()
  await performPortAction(
    db,
    7,
    await command(db, "replace", {
      incoming: { id: 2, version: 0 },
      disposition: "REPAIR",
      destinationId: 20,
    })
  )
  const s = db.snapshot()
  assert.equal(s.miners[0].current_location_id, 20)
  assert.equal(s.miners[1].current_location_id, 10)
  assert.equal(s.miners[1].occupied_slot_id, 10)
  assert.equal(s.ports[0].reserved_miner_id, 2)
  assert.equal(s.movements.length, 2)
  assert.equal(s.history[0].details.operation, "replace")
})
test("replacing a reserved miner releases the old reservation without moving the repair miner", async () => {
  const db = inventory({ occupied: false })
  await performPortAction(
    db,
    7,
    await command(db, "replace", { incoming: { id: 2, version: 0 } })
  )
  const s = db.snapshot()
  assert.equal(s.miners[0].current_location_id, 20)
  assert.equal(s.miners[1].current_location_id, 10)
  assert.equal(s.ports[0].reserved_miner_id, 2)
  assert.equal(s.movements.length, 1)
})
test("a stale incoming miner rolls back outgoing movement, reservation and all history", async () => {
  const db = inventory(),
    before = db.snapshot()
  await assert.rejects(
    performPortAction(
      db,
      7,
      await command(db, "replace", {
        incoming: { id: 2, version: 99 },
        disposition: "REPAIR",
        destinationId: 20,
      })
    ),
    /changed/
  )
  assert.deepEqual(db.snapshot(), before)
})
test("a changed port snapshot cannot overwrite a newer assignment", async () => {
  const db = inventory(),
    cmd = await command(db, "disable")
  db.mutate((s) => s.miners[0].version++)
  const before = db.snapshot()
  await assert.rejects(performPortAction(db, 7, cmd), /changed/)
  assert.deepEqual(db.snapshot(), before)
})
test("returning a reserved miner restores occupancy and its existing port reservation", async () => {
  const db = inventory({ occupied: false })
  await performPortAction(db, 7, await command(db, "return"))
  const s = db.snapshot()
  assert.equal(s.miners[0].current_location_id, 10)
  assert.equal(s.miners[0].occupied_slot_id, 10)
  assert.equal(s.ports[0].reserved_miner_id, 1)
  assert.equal(s.movements.length, 1)
})
test("empty locations offer addition and disabled locations can be re-enabled without restoring old reservations", async () => {
  const db = inventory({ occupied: false, reserved: false })
  await performPortAction(
    db,
    7,
    await command(db, "add", { incoming: { id: 2, version: 0 } })
  )
  assert.equal(db.snapshot().ports[0].reserved_miner_id, 2)
  const disabled = inventory({
    occupied: false,
    reserved: false,
    active: false,
  })
  await performPortAction(disabled, 7, await command(disabled, "enable"))
  assert.equal(disabled.snapshot().ports[0].active, true)
  assert.equal(disabled.snapshot().ports[0].reserved_miner_id, null)
})
test("viewer or inactive accounts are rejected inside the transaction", async () => {
  for (const changes of [{ role: "VIEWER" }, { minerActive: false }]) {
    const db = inventory(changes),
      before = db.snapshot()
    await assert.rejects(
      performPortAction(db, 7, await command(db, "disable")),
      /cannot change/
    )
    assert.deepEqual(db.snapshot(), before)
  }
})
test("serialization retries do not duplicate port actions", async () => {
  const db = inventory({ failSerialization: true })
  await performPortAction(
    db,
    7,
    await command(db, "pull", {
      disposition: "REPAIR",
      destinationId: 20,
      keepReservation: true,
    })
  )
  assert.equal(db.snapshot().movements.length, 1)
  assert.equal(db.snapshot().audits.length, 1)
})
test("repair and pallet destination lookups include populated shared areas", async () => {
  let where
  const result = await readPortDestinations(
    {
      locations: {
        count: async (args) => {
          where = args.where
          return 0
        },
        findMany: async () => [],
      },
    },
    new URLSearchParams({ site: "1", kind: "REPAIR" })
  )
  assert.equal(result.total, 0)
  assert.equal(where.kind, "REPAIR")
  assert.ok(!JSON.stringify(where).includes("current_miners"))
  await assert.rejects(
    readPortDestinations(
      { locations: {} },
      new URLSearchParams({ site: "1", kind: "DEPLOYMENT_SLOT" })
    ),
    /valid destination/
  )
})

test("an inactive port still permits a cleanup pull without keeping a reservation", async () => {
  const db = inventory({ active: false })
  await performPortAction(db, 7, await command(db, "pull"))
  assert.equal(db.snapshot().miners[0].current_location_id, null)
  assert.equal(db.snapshot().ports[0].active, false)
  assert.equal(db.snapshot().ports[0].reserved_miner_id, null)
})
test("conflicting assignments and scrap replacements fail without partial updates", async () => {
  const conflict = inventory()
  conflict.mutate((s) => (s.ports[0].reserved_miner_id = 2))
  const before = conflict.snapshot()
  await assert.rejects(
    performPortAction(conflict, 7, await command(conflict, "disable")),
    /conflicting assignments/
  )
  assert.deepEqual(conflict.snapshot(), before)
  const scrap = inventory()
  scrap.mutate((s) => (s.miners[1].scrap = true))
  const original = scrap.snapshot()
  await assert.rejects(
    performPortAction(
      scrap,
      7,
      await command(scrap, "replace", {
        incoming: { id: 2, version: 0 },
        disposition: "REPAIR",
        destinationId: 20,
      })
    ),
    /registered as scrap/
  )
  assert.deepEqual(scrap.snapshot(), original)
})

test("replacement releases the incoming miner’s old reservation when assigning the new port", async () => {
  const db = inventory()
  db.mutate((s) => (s.ports[1].reserved_miner_id = 2))
  await performPortAction(
    db,
    7,
    await command(db, "replace", {
      incoming: { id: 2, version: 0 },
      disposition: "REPAIR",
      destinationId: 20,
    })
  )
  assert.equal(db.snapshot().ports[0].reserved_miner_id, 2)
  assert.equal(db.snapshot().ports[1].reserved_miner_id, null)
})
