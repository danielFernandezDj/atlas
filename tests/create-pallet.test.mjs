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
const uri = (value) =>
  `data:text/javascript;base64,${Buffer.from(value).toString("base64")}`
const contracts = uri(
  (await compile("../lib/inventory-actions/contracts.ts")).replace(
    '"zod"',
    JSON.stringify(pathToFileURL(require.resolve("zod")).href)
  )
)
const { createPalletSchema } = await import(contracts)
const { performCreatePallet } = await import(
  uri(
    (await compile("../lib/inventory-actions/create-pallet.ts")).replace(
      '"./contracts"',
      JSON.stringify(contracts)
    )
  )
)
const command = createPalletSchema.parse({
  kind: "create-pallet",
  siteId: 1,
  name: " Scrap pallet 01 ",
  code: " pallet-001 ",
  notes: "Ready for scrap assemblies",
  submissionKey: "70000000-0000-4000-8000-000000000001",
})
function inventory({
  siteActive = true,
  role = "TECHNICIAN",
  actorActive = true,
  existing = [],
  serializeOnce = false,
  auditFailOnce = false,
} = {}) {
  let state = { locations: structuredClone(existing), audits: [] },
    attempt = 0
  return {
    snapshot: () => structuredClone(state),
    $transaction: async (fn, options) => {
      assert.equal(options.isolationLevel, "Serializable")
      attempt++
      const draft = structuredClone(state)
      const result = await fn({
        $queryRaw: async () => [],
        users: { findUnique: async () => ({ is_active: actorActive, role }) },
        sites: {
          findUnique: async ({ where }) =>
            [1, 2].includes(where.id)
              ? {
                  id: where.id,
                  name: `Site ${where.id}`,
                  is_active: siteActive,
                }
              : null,
        },
        locations: {
          findFirst: async ({ where }) =>
            draft.locations.find(
              (l) =>
                l.site_id === where.site_id &&
                l.code.toLowerCase() === where.code.equals.toLowerCase()
            ) ?? null,
          create: async ({ data }) => {
            const value = { id: draft.locations.length + 1, ...data }
            draft.locations.push(value)
            return value
          },
        },
        audit_log: {
          findFirst: async (q) =>
            draft.audits.find(
              (a) => a.details.submissionKey === q.where.details.equals
            ) ?? null,
          create: async ({ data }) => {
            if (auditFailOnce && attempt === 1)
              throw new Error("Audit unavailable")
            draft.audits.push(data)
          },
        },
      })
      if (serializeOnce && attempt === 1)
        throw Object.assign(new Error("retry"), { code: "P2034" })
      state = draft
      return result
    },
  }
}
test("pallet input trims labels, canonicalizes codes and rejects blank or unexpected fields", () => {
  assert.equal(command.name, "Scrap pallet 01")
  assert.equal(command.code, "PALLET-001")
  for (const change of [
    { siteId: 0 },
    { name: " " },
    { code: " " },
    { code: "not a valid code" },
    { code: "x".repeat(101) },
    { kind: "create-location" },
    { is_active: false },
  ])
    assert.equal(
      createPalletSchema.safeParse({ ...command, ...change }).success,
      false
    )
})
test("pallet creation stores an active shared PALLET location and a user-attributed receipt", async () => {
  const db = inventory(),
    result = await performCreatePallet(db, 7, command),
    s = db.snapshot()
  assert.equal(result.locationId, 1)
  assert.equal(result.siteName, "Site 1")
  assert.deepEqual(s.locations[0], {
    id: 1,
    site_id: 1,
    kind: "PALLET",
    name: "Scrap pallet 01",
    code: "PALLET-001",
    is_active: true,
    building_id: null,
    can_id: null,
    row_index: null,
    slot_index: null,
  })
  assert.equal(s.audits[0].user_id, 7)
  assert.equal(s.audits[0].action, "PALLET_CREATE")
  assert.equal(s.audits[0].details.notes, command.notes)
  assert.deepEqual(await performCreatePallet(db, 7, command), result)
  assert.deepEqual(db.snapshot(), s)
  await assert.rejects(performCreatePallet(db, 8, command), /already used/)
  await assert.rejects(
    performCreatePallet(db, 7, { ...command, name: "Different" }),
    /already used/
  )
})
test("duplicates are case-insensitive within a site while different sites may reuse the code", async () => {
  const db = inventory({
      existing: [{ id: 1, site_id: 1, kind: "PALLET", code: "pallet-001" }],
    }),
    before = db.snapshot()
  await assert.rejects(performCreatePallet(db, 7, command), /already exists/)
  assert.deepEqual(db.snapshot(), before)
  await performCreatePallet(db, 7, { ...command, siteId: 2 })
  assert.equal(db.snapshot().locations.length, 2)
})
test("inactive sites and read-only or inactive staff cannot create pallets", async () => {
  for (const config of [
    { siteActive: false },
    { role: "VIEWER" },
    { actorActive: false },
  ]) {
    const db = inventory(config)
    await assert.rejects(
      performCreatePallet(db, 7, command),
      /active site|cannot create/
    )
    assert.equal(db.snapshot().locations.length, 0)
    assert.equal(db.snapshot().audits.length, 0)
  }
})
test("audit failure rolls back the pallet, and serialization retries do not duplicate it", async () => {
  const failed = inventory({ auditFailOnce: true })
  await assert.rejects(
    performCreatePallet(failed, 7, command),
    /Audit unavailable/
  )
  assert.equal(failed.snapshot().locations.length, 0)
  await performCreatePallet(failed, 7, command)
  assert.equal(failed.snapshot().locations.length, 1)
  const retry = inventory({ serializeOnce: true })
  await performCreatePallet(retry, 7, command)
  assert.equal(retry.snapshot().locations.length, 1)
  assert.equal(retry.snapshot().audits.length, 1)
})
