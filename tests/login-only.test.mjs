import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import ts from "typescript"

const source = ts.transpileModule(
  await readFile(new URL("../lib/auth/login-only.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }
).outputText
const { loginOnly } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
)

test("public signup and alternate account creation are blocked before reaching Neon", async () => {
  let calls = 0
  const route = loginOnly(async () => {
    calls++
    return new Response("unexpected")
  })
  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
    for (const path of [
      ["sign-up", "email"],
      ["sign-up%2Femail"],
      ["sign%252Dup", "email"],
      ["sign-in", "social"],
      ["sign-in", "anonymous"],
      ["sign-in", "email-otp"],
      ["admin", "create-user"],
      ["callback", "google"],
      ["%invalid"],
    ]) {
      const response = await route(
        new Request("https://atlas.example/api/auth/test", { method }),
        { params: Promise.resolve({ path }) }
      )
      assert.equal(response.status, 403)
      assert.equal(response.headers.get("cache-control"), "no-store")
    }
  }
  assert.equal(calls, 0)
})

test("existing login, sessions, sign-out and recovery keep the SDK response and cookies", async () => {
  for (const path of [
    ["sign-in", "email"],
    ["get-session"],
    ["sign-out"],
    ["reset-password"],
    ["verify-email"],
    ["token"],
  ]) {
    const expected = new Response("upstream", {
      status: 200,
      headers: { "set-cookie": "session=test; HttpOnly; Secure" },
    })
    const request = new Request(
      "https://atlas.example/api/auth/" + path.join("/"),
      { method: "POST" }
    )
    let calls = 0
    const route = loginOnly(async (actual, context) => {
      calls++
      assert.equal(actual, request)
      assert.deepEqual((await context.params).path, path)
      return expected
    })
    assert.equal(
      await route(request, { params: Promise.resolve({ path }) }),
      expected
    )
    assert.equal(calls, 1)
  }
})

test("SDK failures are not converted into successful login responses", async () => {
  const context = { params: Promise.resolve({ path: ["sign-in", "email"] }) }
  const response = new Response("Invalid credentials", { status: 401 })
  assert.equal(
    (
      await loginOnly(async () => response)(
        new Request("https://atlas.example"),
        context
      )
    ).status,
    401
  )
  await assert.rejects(
    loginOnly(async () => {
      throw new Error("Unavailable")
    })(new Request("https://atlas.example"), context),
    /Unavailable/
  )
})

test("the Atlas sign-in form has no self-service registration flow", async () => {
  const panel = await readFile(
    new URL("../components/auth-panel.tsx", import.meta.url),
    "utf8"
  )
  assert.doesNotMatch(panel, /signUp|sign-up|Create account|new-password/)
  assert.match(panel, /authClient\.signIn\.email/)
  assert.match(panel, /current-password/)
})
