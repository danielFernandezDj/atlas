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
const { actionSchema, ActionError, canWriteInventory } = await import(
  contractUrl
)
const readerUrl = uri(
  (await compile("../lib/inventory-actions/read.ts")).replace(
    '"./contracts"',
    JSON.stringify(contractUrl)
  )
)
const { performInventoryAction } = await import(
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
test("commands require serials, explicit companies, valid IDs, versions, UUIDs and notes; unknown fields are rejected", () => {
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
  for (const call of calls)
    assert.deepEqual(call.where, {
      site_id: 1,
      building_id: 2,
      can_id: 3,
      kind: "DEPLOYMENT_SLOT",
    })
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
  assert.deepEqual(where, {
    site_id: 1,
    building_id: 2,
    can_id: 3,
    kind: "DEPLOYMENT_SLOT",
    row_index: 0,
    slot_index: 16,
  })
})
