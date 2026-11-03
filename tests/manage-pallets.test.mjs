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
const uri = (s) =>
  `data:text/javascript;base64,${Buffer.from(s).toString("base64")}`
const contracts = uri(
  (await compile("../lib/inventory-actions/contracts.ts")).replace(
    '"zod"',
    JSON.stringify(pathToFileURL(require.resolve("zod")).href)
  )
)
const { managePalletSchema } = await import(contracts)
const { performManagePallet, readPallets } = await import(
  uri(
    (await compile("../lib/inventory-actions/manage-pallets.ts"))
      .replace('"./contracts"', JSON.stringify(contracts))
      .replace(
        /import \{ Prisma \} from .*?;/,
        "const Prisma={sql:(strings,...values)=>({strings,values}),join:values=>values};"
      )
  )
)
const command = (changes = {}) =>
  managePalletSchema.parse({
    kind: "manage-pallet",
    palletId: 4,
    operation: "update",
    name: "New name",
    code: "p-04",
    expected: { name: "Pallet 4", code: "P04", active: true },
    notes: "Correct the label",
    submissionKey: "70000000-0000-4000-8000-000000000011",
    ...changes,
  })
function inventory({
  role = "TECHNICIAN",
  actorActive = true,
  count = {},
  initial = false,
  kind = "PALLET",
  siteActive = true,
  active = true,
  duplicate = false,
  auditFailure = false,
  retry = false,
} = {}) {
  let state = {
      pallet: {
        id: 4,
        kind,
        name: "Pallet 4",
        code: "P04",
        site_id: 1,
        is_active: active,
        site: { name: "Rebel", is_active: siteActive },
        _count: {
          current_miners: 0,
          ports: 0,
          movements_from: 0,
          movements_to: 0,
          ...count,
        },
      },
      audits: [],
    },
    attempt = 0
  return {
    snapshot: () => structuredClone(state),
    $transaction: async (fn, opts) => {
      assert.equal(opts.isolationLevel, "Serializable")
      attempt++
      const draft = structuredClone(state)
      const result = await fn({
        $queryRaw: async () => [],
        users: { findUnique: async () => ({ role, is_active: actorActive }) },
        locations: {
          findUnique: async () => draft.pallet,
          findFirst: async () => (duplicate ? { id: 5 } : null),
          update: async ({ data }) => Object.assign(draft.pallet, data),
          delete: async () => {
            draft.pallet = null
          },
        },
        miner_history: { findFirst: async () => (initial ? { id: 1 } : null) },
        audit_log: {
          findFirst: async (q) =>
            draft.audits.find(
              (a) => a.details.submissionKey === q.where.details.equals
            ),
          create: async ({ data }) => {
            if (auditFailure) throw new Error("Audit unavailable")
            draft.audits.push(data)
          },
        },
      })
      if (retry && attempt === 1)
        throw Object.assign(new Error("retry"), { code: "P2034" })
      state = draft
      return result
    },
  }
}
test("pallet management validates operation, expected state, reason and code", () => {
  assert.equal(command().code, "P-04")
  for (const change of [
    { operation: "move" },
    { notes: "" },
    { palletId: 0 },
    { code: "invalid code" },
    { expected: { name: "x" } },
    { siteId: 9 },
  ])
    assert.equal(
      managePalletSchema.safeParse({ ...command(), ...change }).success,
      false
    )
})
test("updates retain site and occupancy, audit before/after and replay safely", async () => {
  const db = inventory({ count: { current_miners: 2 } }),
    input = command(),
    result = await performManagePallet(db, 7, input)
  assert.equal(db.snapshot().pallet.name, "New name")
  assert.equal(db.snapshot().pallet.site_id, 1)
  assert.equal(db.snapshot().pallet._count.current_miners, 2)
  const audit = db.snapshot().audits[0]
  assert.equal(audit.action, "PALLET_UPDATE")
  assert.equal(audit.user_id, 7)
  assert.equal(audit.details.before.name, "Pallet 4")
  assert.equal(audit.details.after.name, "New name")
  assert.deepEqual(await performManagePallet(db, 7, input), result)
  assert.equal(db.snapshot().audits.length, 1)
  await assert.rejects(performManagePallet(db, 8, input), /already used/)
  await assert.rejects(
    performManagePallet(db, 7, { ...input, name: "Other" }),
    /already used/
  )
})
test("occupied pallets cannot be archived or deleted; history only allows archive", async () => {
  for (const operation of ["archive", "delete"])
    for (const count of [{ current_miners: 1 }, { ports: 1 }]) {
      const db = inventory({ count })
      await assert.rejects(
        performManagePallet(db, 7, command({ operation })),
        /Move all miners/
      )
      assert.equal(db.snapshot().audits.length, 0)
    }
  for (const options of [
    { count: { movements_from: 1 } },
    { count: { movements_to: 1 } },
    { initial: true },
  ]) {
    const db = inventory(options)
    await assert.rejects(
      performManagePallet(db, 7, command({ operation: "delete" })),
      /has been used/
    )
    await performManagePallet(db, 7, command({ operation: "archive" }))
    assert.equal(db.snapshot().pallet.is_active, false)
  }
})
test("unused deletion retains audit receipt and can be retried after removal", async () => {
  const db = inventory(),
    input = command({ operation: "delete" })
  await performManagePallet(db, 7, input)
  assert.equal(db.snapshot().pallet, null)
  assert.equal(db.snapshot().audits[0].details.after, null)
  await performManagePallet(db, 7, input)
  assert.equal(db.snapshot().audits.length, 1)
})
test("restore requires active site and supports archived pallets", async () => {
  const input = command({
      operation: "restore",
      expected: { name: "Pallet 4", code: "P04", active: false },
    }),
    db = inventory({ active: false })
  await performManagePallet(db, 7, input)
  assert.equal(db.snapshot().pallet.is_active, true)
  await assert.rejects(
    performManagePallet(
      inventory({ active: false, siteActive: false }),
      7,
      input
    ),
    /site must be active/
  )
})
test("permission, kind, stale data, duplicate codes and no-op edits fail without writes", async () => {
  for (const [config, input, pattern] of [
    [{ role: "VIEWER" }, command(), /cannot manage/],
    [{ actorActive: false }, command(), /cannot manage/],
    [{ kind: "REPAIR" }, command(), /not found/],
    [
      {},
      command({ expected: { name: "Old name", code: "P04", active: true } }),
      /changed/,
    ],
    [{ duplicate: true }, command(), /already used/],
    [{}, command({ name: "Pallet 4", code: "P04" }), /Change the name/],
  ]) {
    const db = inventory(config),
      before = db.snapshot()
    await assert.rejects(performManagePallet(db, 7, input), pattern)
    assert.deepEqual(db.snapshot(), before)
  }
})
test("audit failure rolls back edits or deletion, serialization retries only save once", async () => {
  for (const operation of ["update", "delete"]) {
    const db = inventory({ auditFailure: true }),
      before = db.snapshot()
    await assert.rejects(
      performManagePallet(db, 7, command({ operation })),
      /Audit unavailable/
    )
    assert.deepEqual(db.snapshot(), before)
  }
  const db = inventory({ retry: true })
  await performManagePallet(db, 7, command())
  assert.equal(db.snapshot().audits.length, 1)
})
test("list is bounded and includes archived pallets with occupancy/history status", async () => {
  let query
  const db = {
    locations: {
      findMany: async (q) => {
        query = q
        return [{ ...inventory({ active: false }).snapshot().pallet }]
      },
      count: async () => 1,
    },
    $queryRaw: async () => [{ id: 4 }],
  }
  const data = await readPallets(
    db,
    new URLSearchParams({ page: "2", search: "Pallet", site: "1" })
  )
  assert.equal(query.skip, 50)
  assert.equal(query.take, 50)
  assert.equal(query.where.kind, "PALLET")
  assert.equal(query.where.is_active, undefined)
  assert.equal(data.items[0].active, false)
  assert.equal(data.items[0].used, true)
  await assert.rejects(
    readPallets(db, new URLSearchParams({ page: "-1" })),
    /filters/
  )
})
