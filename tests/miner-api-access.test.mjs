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

async function guard(session, staff) {
  const authUrl = url(
    `export const auth={getSession:async()=>(${JSON.stringify({ data: session, error: null })})}`
  )
  const dbUrl = url(
    `export const prisma={users:{findUnique:async()=>(${JSON.stringify(staff)})}}`
  )
  const source = (await compile("../lib/miners/api-access.ts"))
    .replace('import "server-only";', "")
    .replace('"@/lib/auth/server"', JSON.stringify(authUrl))
    .replace('"@/lib/prisma"', JSON.stringify(dbUrl))
  return (await import(url(source))).minerReadAccess()
}

test("miner API access requires a session, verified email and an active staff record", async () => {
  assert.equal((await guard(null, { is_active: true })).status, 401)
  assert.equal(
    (
      await guard(
        { user: { email: "user@example.test", emailVerified: false } },
        { is_active: true }
      )
    ).status,
    403
  )
  assert.equal(
    (
      await guard(
        { user: { email: "user@example.test", emailVerified: true } },
        null
      )
    ).status,
    403
  )
  assert.equal(
    (
      await guard(
        { user: { email: "user@example.test", emailVerified: true } },
        { is_active: false }
      )
    ).status,
    403
  )
  assert.equal(
    await guard(
      { user: { email: "user@example.test", emailVerified: true } },
      { is_active: true }
    ),
    null
  )
})

test("both miner endpoints check access before invoking a database read and expose no writes", async () => {
  for (const relative of [
    "../app/api/miners/route.ts",
    "../app/api/miners/[id]/route.ts",
  ]) {
    const source = await readFile(new URL(relative, import.meta.url), "utf8")
    assert.ok(
      source.indexOf("await minerReadAccess()") <
        source.indexOf("await readMinerInventory")
    )
    assert.match(source, /if \(denied\) return denied/)
    assert.match(source, /Cache-Control.*no-store/)
    assert.doesNotMatch(
      source,
      /export (?:async )?function (?:POST|PUT|DELETE|PATCH)/
    )
  }
})
