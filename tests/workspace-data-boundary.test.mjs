import assert from "node:assert/strict"
import test from "node:test"
import { readFile, stat } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const root = fileURLToPath(new URL("../", import.meta.url))
async function dependencies(entry, seen = new Set()) {
  const file = resolve(root, entry)
  if (seen.has(file)) return seen
  seen.add(file)
  const source = ts.createSourceFile(
    file,
    await readFile(file, "utf8"),
    ts.ScriptTarget.Latest,
    true
  )
  for (const item of source.statements) {
    if (!ts.isImportDeclaration(item) || item.importClause?.isTypeOnly) continue
    const specifier = item.moduleSpecifier.text
    if (
      specifier.endsWith(".css") ||
      (!specifier.startsWith(".") && !specifier.startsWith("@/"))
    )
      continue
    const base = specifier.startsWith("@/")
      ? resolve(root, specifier.slice(2))
      : resolve(dirname(file), specifier)
    const candidates = [
      base,
      base + ".tsx",
      base + ".ts",
      resolve(base, "index.tsx"),
      resolve(base, "index.ts"),
    ]
    let found = false
    for (const candidate of candidates) {
      if (
        await stat(candidate).then(
          (s) => s.isFile(),
          () => false
        )
      ) {
        await dependencies(candidate, seen)
        found = true
        break
      }
    }
    assert.ok(found, `Unresolved local import: ${specifier}`)
  }
  return seen
}

for (const route of ["app/technician/page.tsx", "app/management/page.tsx"]) {
  test(`${route} never loads synthetic fixtures`, async () => {
    const files = await dependencies(route)
    assert.ok(files.size > 1)
    for (const file of files) {
      assert.doesNotMatch(file, /\/lib\/demo\/|\/demo-data\.ts$/)
    }
  })
}

test("dashboard client bundles never import the database or server query layer", async () => {
  for (const entry of [
    "components/technician-dashboard.tsx",
    "components/technician/live-miner-workspace.tsx",
    "components/technician/site-overview.tsx",
    "components/technician/movement-history.tsx",
  ]) {
    for (const file of await dependencies(entry)) {
      assert.doesNotMatch(
        file,
        /\/lib\/prisma\.ts$|\/lib\/dashboard\/read\.ts$|\/lib\/miners\/(?:read-inventory|api-access)\.ts$|\/lib\/generated\/prisma\//
      )
      const source = await readFile(file, "utf8")
      assert.doesNotMatch(
        source,
        /@prisma\/|@neondatabase\/serverless|DATABASE_URL/
      )
    }
  }
})
