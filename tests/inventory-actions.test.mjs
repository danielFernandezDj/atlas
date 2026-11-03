import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
import ts from "typescript"
const require = createRequire(import.meta.url)
const compile = async (p) =>
  ts
    .transpileModule(await readFile(new URL(p, import.meta.url), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    })
    .outputText.replace('import "server-only";', "")
const uri = (s) =>
  `data:text/javascript;base64,${Buffer.from(s).toString("base64")}`
const contractUrl = uri(
  (await compile("../lib/inventory-actions/contracts.ts")).replace(
    '"zod"',
    JSON.stringify(pathToFileURL(require.resolve("zod")).href)
  )
)
const {
  actionSchema,
  insertSchema,
  createBatchSchema,
  creationEntrySchema,
  ActionError,
  canWriteInventory,
} = await import(contractUrl)
const readerUrl = uri(
  (await compile("../lib/inventory-actions/read.ts")).replace(
    '"./contracts"',
    JSON.stringify(contractUrl)
  )
)
const {
  performInventoryAction,
  performInsertBatch,
  performCreateBatch,
  placementKey,
} = await import(
  uri(
    (await compile("../lib/inventory-actions/write.ts"))
      .replace('"./contracts"', JSON.stringify(contractUrl))
      .replace('"./read"', JSON.stringify(readerUrl))
  )
)
const move = {
  kind: "move",
  minerId: 1,
  version: 0,
  locationId: 2,
  notes: "Repair completed",
  submissionKey: "00000000-0000-4000-8000-000000000001",
}
test("commands require serials, valid IDs, versions, UUIDs and notes; unknown fields are rejected", () => {
  assert.ok(actionSchema.safeParse(move).success)
  for (const input of [
    { ...move, version: -1 },
    { ...move, minerId: 0 },
    { ...move, notes: "" },
    { ...move, submissionKey: "bad" },
    { ...move, userId: 999 },
    {
      kind: "create",
      skeletonSerial: " ",
      ownerId: 1,
      managerId: 1,
      modelId: null,
      assetTag: null,
      locationId: 2,
      notes: "Create miner",
      submissionKey: move.submissionKey,
    },
  ])
    assert.equal(actionSchema.safeParse(input).success, false)
  assert.equal(canWriteInventory("VIEWER"), false)
  for (const role of ["ADMIN", "MANAGER", "TECHNICIAN"])
    assert.equal(canWriteInventory(role), true)
})
test("permission is checked inside the write transaction before any inventory access", async () => {
  for (const actor of [
    null,
    { is_active: false, role: "ADMIN" },
    { is_active: true, role: "VIEWER" },
  ]) {
    const db = {
      $transaction: async (callback) =>
        callback({
          $queryRaw: async () => [],
          users: { findUnique: async () => actor },
          get audit_log() {
            throw new Error("Must not read inventory")
          },
        }),
    }
    await assert.rejects(
      performInventoryAction(db, 1, move),
      (e) => e instanceof ActionError && e.status === 403
    )
    await assert.rejects(
      performInsertBatch(db, 1, {
        kind: "insert",
        entries: [{ minerId: 1, version: 0, locationId: 2 }],
        notes: "Deploy",
        submissionKey: move.submissionKey,
      }),
      (e) => e instanceof ActionError && e.status === 403
    )
  }
})
test("receipt replay returns the committed result, and a reused key cannot change the payload or actor", async () => {
  const { submissionKey, ...payload } = move
  const details = {
    fingerprint: JSON.stringify(payload),
    result: { minerId: 1, message: "Miner location updated." },
  }
  const make = (user_id, details) => ({
    $transaction: async (callback) =>
      callback({
        $queryRaw: async () => [],
        users: {
          findUnique: async () => ({ is_active: true, role: "TECHNICIAN" }),
        },
        audit_log: { findFirst: async () => ({ user_id, details }) },
      }),
  })
  assert.deepEqual(
    await performInventoryAction(make(1, details), 1, move),
    details.result
  )
  await assert.rejects(
    performInventoryAction(make(2, details), 1, move),
    (e) => e.status === 409
  )
  await assert.rejects(
    performInventoryAction(
      make(1, { ...details, fingerprint: "different" }),
      1,
      move
    ),
    (e) => e.status === 409
  )
})
test("write endpoint checks the authenticated actor, origin, body type and schema before mutation", async () => {
  const source = await readFile(
    new URL("../app/api/inventory-actions/route.ts", import.meta.url),
    "utf8"
  )
  const post = source.slice(source.indexOf("export async function POST"))
  assert.ok(
    post.indexOf("await actionActor(true)") <
      post.indexOf("await performInventoryAction(")
  )
  assert.match(post, /headers\.get\("origin"\)/)
  assert.match(post, /application\/json/)
  assert.match(post, /actionSchema.safeParse/)
  const activity = await readFile(
    new URL("../app/api/account-activity/route.ts", import.meta.url),
    "utf8"
  )
  assert.match(activity, /user_id: actor.id/)
  assert.doesNotMatch(activity, /export async function (POST|PUT|DELETE|PATCH)/)
})

test("editing a miner cannot change its owner or management company", () => {
  const edit = {
    kind: "edit",
    minerId: 1,
    version: 0,
    modelId: null,
    assetTag: "ASSET",
    notes: "Correct asset tag",
    submissionKey: move.submissionKey,
  }
  assert.equal(actionSchema.safeParse(edit).success, true)
  assert.equal(actionSchema.safeParse({ ...edit, ownerId: 2 }).success, false)
  assert.equal(actionSchema.safeParse({ ...edit, managerId: 2 }).success, false)
})
test("location choices are filtered by site, building and can with bounded pagination", async () => {
  const { readActionLocations } = await import(readerUrl)
  const calls = []
  const db = {
    locations: {
      count: async (query) => {
        calls.push(query)
        return 1
      },
      findMany: async (query) => {
        calls.push(query)
        return []
      },
    },
  }
  await readActionLocations(
    db,
    new URLSearchParams({
      site: "1",
      building: "2",
      can: "3",
      kind: "DEPLOYMENT_SLOT",
      page: "2",
    })
  )
  for (const call of calls) {
    const { AND, ...filters } = call.where
    assert.ok(AND.length > 0)
    assert.deepEqual(filters, {
      site_id: 1,
      building_id: 2,
      can_id: 3,
      kind: "DEPLOYMENT_SLOT",
    })
  }
  assert.equal(calls[1].skip, 20)
  assert.equal(calls[1].take, 20)
  for (const input of [{ building: "-1" }, { can: "not-an-id" }])
    await assert.rejects(
      readActionLocations(db, new URLSearchParams(input)),
      /Invalid location filters/
    )
})

test("port coordinates resolve an exact row and column within a selected can", async () => {
  const { readActionLocations } = await import(readerUrl)
  let where
  const db = {
    locations: {
      count: async (query) => {
        where = query.where
        return 0
      },
      findMany: async () => [],
    },
  }
  await readActionLocations(
    db,
    new URLSearchParams({
      site: "1",
      building: "2",
      can: "3",
      kind: "DEPLOYMENT_SLOT",
      search: "0/16",
    })
  )
  const { AND, ...filters } = where
  assert.ok(AND.length > 0)
  assert.deepEqual(filters, {
    site_id: 1,
    building_id: 2,
    can_id: 3,
    kind: "DEPLOYMENT_SLOT",
    row_index: 0,
    slot_index: 16,
  })
})

const batch = {
  kind: "insert",
  entries: [
    { minerId: 1, version: 0, locationId: 11 },
    { minerId: 2, version: 0, locationId: 12 },
  ],
  notes: "Deploy repaired miners",
  submissionKey: move.submissionKey,
}
test("batch commands bound size and reject duplicate miners or ports", () => {
  assert.equal(insertSchema.safeParse(batch).success, true)
  for (const entries of [
    [],
    Array(26).fill(batch.entries[0]),
    [batch.entries[0], { ...batch.entries[1], minerId: 1 }],
    [batch.entries[0], { ...batch.entries[1], locationId: 11 }],
  ])
    assert.equal(insertSchema.safeParse({ ...batch, entries }).success, false)
  assert.equal(
    placementKey(batch.submissionKey, 0),
    placementKey(batch.submissionKey, 0)
  )
  assert.notEqual(
    placementKey(batch.submissionKey, 0),
    placementKey(batch.submissionKey, 1)
  )
})
test("new miners use fixed companies and reject caller-supplied assignments", async () => {
  const { fixedCompanies } = await import(readerUrl)
  const companies = [
    { id: 1, name: "Ionic" },
    { id: 2, name: "DigitalCarpenter.io" },
    { id: 3, name: "Another owner" },
  ]
  assert.deepEqual(fixedCompanies(companies), {
    owner: companies[0],
    manager: companies[1],
  })
  assert.equal(fixedCompanies([]), null)
  assert.equal(fixedCompanies([...companies, { id: 4, name: "IONIC" }]), null)
  const create = {
    kind: "create",
    skeletonSerial: "NEW-SERIAL",
    registrationState: "READY",
    palletId: null,
    componentConfirmation: null,
    powerSupplyPresent: false,
    modelId: null,
    assetTag: null,
    notes: "Register miner",
    submissionKey: move.submissionKey,
  }
  assert.equal(actionSchema.safeParse(create).success, true)
  assert.equal(
    actionSchema.safeParse({ ...create, ownerId: 3, managerId: 3 }).success,
    false
  )
})
test("availability excludes occupied, reserved, inactive and unconfigured ports", async () => {
  const { isLocationAvailable, availableLocationWhere } = await import(
    readerUrl
  )
  const l = {
    kind: "DEPLOYMENT_SLOT",
    is_active: true,
    site: { is_active: true },
    building: { is_active: true },
    can: { is_active: true },
    current_miners: [],
    slot_occupant: null,
    ports: [
      { reserved_miner_id: null, active: true, switch: { active: true } },
    ],
  }
  assert.equal(isLocationAvailable(l), true)
  for (const changes of [
    { current_miners: [{ id: 1 }] },
    { slot_occupant: { id: 1 } },
    { ports: [{ ...l.ports[0], reserved_miner_id: 1 }] },
    { is_active: false },
    { site: { is_active: false } },
    { building: { is_active: false } },
    { can: { is_active: false } },
    { ports: [] },
    { ports: [{ ...l.ports[0], active: false }] },
    { ports: [{ ...l.ports[0], switch: { active: false } }] },
  ])
    assert.equal(isLocationAvailable({ ...l, ...changes }), false)
  const calls = []
  const { readActionLocations } = await import(readerUrl)
  await readActionLocations(
    {
      locations: {
        count: async (q) => {
          calls.push(q)
          return 0
        },
        findMany: async (q) => {
          calls.push(q)
          return []
        },
      },
    },
    new URLSearchParams()
  )
  for (const call of calls)
    assert.deepEqual(call.where.AND, availableLocationWhere)
})
function transactionalInventory(reservations = {}) {
  let state = {
    miners: [
      { id: 1, version: 0, current_location_id: 1 },
      { id: 2, version: 0, current_location_id: 2 },
    ],
    movements: [],
    audits: [],
    reservations: { ...reservations },
  }
  return {
    snapshot: () => structuredClone(state),
    $transaction: async (fn) => {
      const draft = structuredClone(state)
      const tx = {
        $queryRaw: async () => [],
        users: {
          findUnique: async () => ({ is_active: true, role: "TECHNICIAN" }),
        },
        audit_log: {
          findFirst: async (q) =>
            draft.audits.find(
              (a) => a.details.submissionKey === q.where.details.equals
            ) ?? null,
          create: async ({ data }) => draft.audits.push(data),
        },
        locations: {
          findUnique: async ({ where }) => ({
            id: where.id,
            kind: "DEPLOYMENT_SLOT",
            is_active: true,
            site: { is_active: true },
            building: { is_active: true },
            can: { is_active: true },
            current_miners: [],
            slot_occupant: null,
            ports: [
              {
                active: true,
                reserved_miner_id: draft.reservations[where.id] ?? null,
                switch: { active: true },
              },
            ],
          }),
        },
        miner: {
          findUnique: async ({ where }) =>
            draft.miners.find((m) => m.id === where.id),
          findFirst: async () => null,
          updateMany: async ({ where, data }) => {
            const m = draft.miners.find(
              (m) => m.id === where.id && m.version === where.version
            )
            if (!m) return { count: 0 }
            Object.assign(m, { ...data, version: m.version + 1 })
            return { count: 1 }
          },
        },
        port_index: {
          findUnique: async ({ where }) => ({
            id: where.location_id,
            active: true,
            reserved_miner_id: null,
            switch: { active: true },
          }),
          updateMany: async ({ where, data }) => {
            if (where.id && typeof where.id === "number")
              draft.reservations[where.id] = data.reserved_miner_id
            return { count: 1 }
          },
        },
        miner_movements: {
          create: async ({ data }) => draft.movements.push(data),
        },
      }
      const result = await fn(tx)
      state = draft
      return result
    },
  }
}
test("batch insertion commits histories and reservations together and retries without duplicates", async () => {
  const db = transactionalInventory()
  const result = await performInsertBatch(db, 1, batch)
  assert.deepEqual(result.minerIds, [1, 2])
  assert.equal(db.snapshot().movements.length, 2)
  assert.deepEqual(db.snapshot().reservations, { 11: 1, 12: 2 })
  assert.equal(db.snapshot().audits.length, 3)
  assert.deepEqual(await performInsertBatch(db, 1, batch), result)
  assert.equal(db.snapshot().movements.length, 2)
  await assert.rejects(
    performInsertBatch(db, 1, { ...batch, notes: "Different request" }),
    /already used/
  )
})
test("a stale second miner rolls back the first placement, history and receipts", async () => {
  const db = transactionalInventory()
  const before = db.snapshot()
  await assert.rejects(
    performInsertBatch(db, 1, {
      ...batch,
      entries: [batch.entries[0], { ...batch.entries[1], version: 9 }],
    }),
    /changed/
  )
  assert.deepEqual(db.snapshot(), before)
})

test("a port reserved after selection rejects and rolls back the whole batch", async () => {
  const db = transactionalInventory({ 12: 99 })
  const before = db.snapshot()
  await assert.rejects(performInsertBatch(db, 1, batch), /occupied, reserved/)
  assert.deepEqual(db.snapshot(), before)
})

const readyCreation = {
  skeletonSerial: "READY-1",
  registrationState: "READY",
  palletId: null,
  componentConfirmation: null,
  powerSupplyPresent: false,
  modelId: null,
  assetTag: null,
  notes: "",
}
const confirmedParts = {
  skeleton: true,
  controlBoard: true,
  hashboard1: true,
  hashboard2: true,
  hashboard3: true,
  acknowledged: true,
}
const scrapCreation = {
  ...readyCreation,
  skeletonSerial: "SCRAP-1",
  registrationState: "SCRAP",
  palletId: 201,
  componentConfirmation: confirmedParts,
}
const creationBatch = {
  kind: "create-batch",
  entries: [readyCreation, scrapCreation],
  submissionKey: move.submissionKey,
  notes: "",
}
test("ready creation has no destination; scrap requires a pallet and every authenticated acknowledgment field", () => {
  assert.equal(creationEntrySchema.safeParse(readyCreation).success, true)
  assert.equal(creationEntrySchema.safeParse(scrapCreation).success, true)
  for (const input of [
    { ...readyCreation, palletId: 201 },
    { ...readyCreation, componentConfirmation: confirmedParts },
    { ...scrapCreation, palletId: null },
    { ...scrapCreation, componentConfirmation: null },
  ])
    assert.equal(creationEntrySchema.safeParse(input).success, false)
  for (const key of Object.keys(confirmedParts))
    assert.equal(
      creationEntrySchema.safeParse({
        ...scrapCreation,
        componentConfirmation: { ...confirmedParts, [key]: false },
      }).success,
      false
    )
  assert.equal(
    creationEntrySchema.safeParse({
      ...scrapCreation,
      componentConfirmation: { ...confirmedParts, confirmedByUserId: 999 },
    }).success,
    false
  )
  assert.equal(createBatchSchema.safeParse(creationBatch).success, true)
  assert.equal(
    createBatchSchema.safeParse({ ...creationBatch, entries: [] }).success,
    false
  )
  assert.equal(
    createBatchSchema.safeParse({
      ...creationBatch,
      entries: [scrapCreation, scrapCreation],
    }).success,
    false
  )
  assert.equal(
    createBatchSchema.safeParse({
      ...creationBatch,
      entries: Array(26).fill(readyCreation),
    }).success,
    false
  )
  assert.equal(
    createBatchSchema.safeParse({
      ...creationBatch,
      entries: [scrapCreation, { ...scrapCreation, skeletonSerial: "SCRAP-2" }],
    }).success,
    true
  )
})
function creationInventory() {
  let state = {
    miners: [],
    skeletons: [],
    history: [],
    movements: [],
    audits: [],
  }
  return {
    snapshot: () => structuredClone(state),
    $transaction: async (fn) => {
      const draft = structuredClone(state)
      const tx = {
        $queryRaw: async () => [],
        users: {
          findUnique: async () => ({ is_active: true, role: "TECHNICIAN" }),
        },
        companies: {
          findMany: async () => [
            { id: 1, name: "Ionic" },
            { id: 2, name: "DigitalCarpenter.io" },
          ],
        },
        audit_log: {
          findFirst: async (q) =>
            draft.audits.find(
              (a) => a.details.submissionKey === q.where.details.equals
            ) ?? null,
          create: async ({ data }) => draft.audits.push(data),
        },
        miner: {
          findUnique: async ({ where }) =>
            draft.miners.find((m) => m.serial_number === where.serial_number) ??
            null,
          create: async ({ data }) => {
            const m = { id: draft.miners.length + 1, ...data }
            draft.miners.push(m)
            return { id: m.id }
          },
        },
        skeleton: {
          findUnique: async ({ where }) =>
            draft.skeletons.find(
              (s) => s.serial_number === where.serial_number
            ) ?? null,
          create: async ({ data }) =>
            draft.skeletons.push({
              id: draft.skeletons.length + 1,
              condition: "UNKNOWN",
              ...data,
            }),
        },
        locations: {
          findUnique: async ({ where }) => ({
            id: where.id,
            kind: where.id === 201 ? "PALLET" : "DEPLOYMENT_SLOT",
            is_active: true,
            site: { is_active: true },
            building: null,
            can: null,
            current_miners: [{ id: 99 }],
            slot_occupant: null,
            ports: [],
          }),
        },
        miner_history: { create: async ({ data }) => draft.history.push(data) },
        miner_movements: {
          create: async ({ data }) => draft.movements.push(data),
        },
        get control_boards() {
          throw new Error("Do not invent a board MAC or serial")
        },
        get hash_boards() {
          throw new Error("Do not invent board identities")
        },
        get port_index() {
          throw new Error("Creation must not reserve deployment ports")
        },
      }
      const result = await fn(tx)
      state = draft
      return result
    },
  }
}
test("mixed creation records ready miners without location and scrap with pallet and attributable presence confirmations", async () => {
  const db = creationInventory()
  const result = await performCreateBatch(db, 7, creationBatch)
  assert.deepEqual(result.minerIds, [1, 2])
  const state = db.snapshot()
  assert.equal(state.miners[0].current_location_id, null)
  assert.equal(state.miners[0].occupied_slot_id, null)
  assert.equal(state.miners[1].current_location_id, 201)
  assert.equal(state.miners[1].occupied_slot_id, null)
  assert.equal(state.movements.length, 1)
  assert.equal(state.history[0].details.registrationState, "READY")
  const ack = state.history[1].details.componentConfirmation
  for (const key of Object.keys(confirmedParts)) assert.equal(ack[key], true)
  assert.equal(state.history[1].user_id, 7)
  assert.equal(ack.confirmedByUserId, 7)
  assert.equal(ack.statementVersion, "scrap-assembly-v1")
  assert.equal(ack.identifiersRecorded, false)
  assert.ok(Number.isFinite(Date.parse(ack.confirmedAt)))
  assert.equal(
    state.skeletons.every((s) => s.condition === "UNKNOWN"),
    true
  )
  assert.deepEqual(await performCreateBatch(db, 7, creationBatch), result)
  assert.deepEqual(db.snapshot(), state)
})
test("multiple scrap miners can share an already populated active pallet", async () => {
  const db = creationInventory()
  await performCreateBatch(db, 7, {
    ...creationBatch,
    entries: [
      scrapCreation,
      { ...scrapCreation, skeletonSerial: "SCRAP-2", powerSupplyPresent: true },
    ],
  })
  assert.deepEqual(
    db.snapshot().miners.map((m) => m.current_location_id),
    [201, 201]
  )
  assert.equal(
    db.snapshot().history[1].details.componentConfirmation.powerSupplyPresent,
    true
  )
})
test("a bad scrap pallet rolls back earlier ready registrations and their receipts", async () => {
  const db = creationInventory(),
    before = db.snapshot()
  await assert.rejects(
    performCreateBatch(db, 7, {
      ...creationBatch,
      entries: [readyCreation, { ...scrapCreation, palletId: 999 }],
    }),
    /active pallet/
  )
  assert.deepEqual(db.snapshot(), before)
})
test("duplicate serials are rejected on the server even when an earlier availability check succeeded", async () => {
  const db = creationInventory()
  await performCreateBatch(db, 7, creationBatch)
  const before = db.snapshot()
  await assert.rejects(
    performCreateBatch(db, 7, {
      ...creationBatch,
      submissionKey: "00000000-0000-4000-8000-000000000009",
    }),
    /already assigned|serial number already belongs/
  )
  assert.deepEqual(db.snapshot(), before)
})
test("scrap registration blocks later deployment", async () => {
  const db = {
    $transaction: async (fn) =>
      fn({
        $queryRaw: async () => [],
        users: {
          findUnique: async () => ({ is_active: true, role: "TECHNICIAN" }),
        },
        audit_log: { findFirst: async () => null },
        miner: {
          findUnique: async () => ({
            id: 1,
            version: 0,
            current_location_id: 201,
            history: [{ id: 1 }],
          }),
        },
        locations: {
          findUnique: async () => ({
            id: 11,
            kind: "DEPLOYMENT_SLOT",
            is_active: true,
            site: { is_active: true },
            building: { is_active: true },
            can: { is_active: true },
          }),
        },
      }),
  }
  await assert.rejects(
    performInventoryAction(db, 7, move),
    /registered as scrap/
  )
})
test("scrap pallet lookup includes shared occupied pallets while keeping active-site filtering", async () => {
  const { readActionLocations } = await import(readerUrl)
  let where
  const pallet = {
    id: 201,
    name: "Scrap pallet",
    code: "SCRAP",
    kind: "PALLET",
    is_active: true,
    site: { is_active: true, name: "Rebel" },
    building: null,
    can: null,
    row_index: null,
    slot_index: null,
    current_miners: [{ id: 99 }],
    slot_occupant: null,
    ports: [],
  }
  const result = await readActionLocations(
    {
      locations: {
        count: async (args) => {
          where = args.where
          return 1
        },
        findMany: async () => [pallet],
      },
    },
    new URLSearchParams({ site: "1", kind: "PALLET" }),
    true
  )
  assert.equal(result.items[0].available, true)
  assert.ok(!JSON.stringify(where.AND).includes("current_miners"))
  assert.ok(JSON.stringify(where.AND).includes("PALLET"))
})
