import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import ts from "typescript"

const source = ts.transpileModule(
  await readFile(
    new URL("../lib/auth/password-recovery.ts", import.meta.url),
    "utf8"
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }
).outputText
const { requestRecoveryCode, completePasswordRecovery } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
)
const input = {
  email: "  Staff@Example.test  ",
  code: " 123456 ",
  password: "Example-Password-1",
  confirmation: "Example-Password-1",
}

function client(error = null) {
  const calls = []
  return {
    calls,
    emailOtp: {
      requestPasswordReset: async (body) => {
        calls.push({ action: "request", body })
        return { error }
      },
      resetPassword: async (body) => {
        calls.push({ action: "reset", body })
        return { error }
      },
    },
  }
}

test("recovery requests use the existing-account OTP reset endpoint with a normalized email", async () => {
  const sdk = client()
  assert.deepEqual(await requestRecoveryCode(sdk, input.email), { ok: true })
  assert.deepEqual(sdk.calls, [
    { action: "request", body: { email: "staff@example.test" } },
  ])
})

test("known and unknown accounts receive the same acknowledgement", async () => {
  assert.deepEqual(
    await requestRecoveryCode(client(), input.email),
    await requestRecoveryCode(client({ code: "USER_NOT_FOUND" }), input.email)
  )
})

test("invalid codes, mismatched passwords and unsupported password lengths never reach Neon", async () => {
  for (const change of [
    { code: "" },
    { code: "abc123" },
    { password: "short", confirmation: "short" },
    { password: "x".repeat(129), confirmation: "x".repeat(129) },
    { confirmation: "different" },
  ]) {
    const sdk = client()
    assert.equal(
      (await completePasswordRecovery(sdk, { ...input, ...change })).ok,
      false
    )
    assert.equal(sdk.calls.length, 0)
  }
})

test("successful reset passes the code and new password only to Neon's password setter", async () => {
  const sdk = client()
  assert.deepEqual(await completePasswordRecovery(sdk, input), { ok: true })
  assert.deepEqual(sdk.calls, [
    {
      action: "reset",
      body: {
        email: "staff@example.test",
        otp: "123456",
        password: input.password,
      },
    },
  ])
})

test("expired or invalid OTPs and service failures never report a successful password reset", async () => {
  for (const error of [
    { code: "OTP_EXPIRED" },
    { code: "INVALID_OTP" },
    { status: 500 },
  ]) {
    assert.equal(
      (await completePasswordRecovery(client(error), input)).ok,
      false
    )
  }
  const sdk = client({ status: 429 })
  assert.match(
    (await requestRecoveryCode(sdk, input.email)).message,
    /Too many requests/
  )
  sdk.emailOtp.resetPassword = async () => {
    throw new Error("Offline")
  }
  assert.equal((await completePasswordRecovery(sdk, input)).ok, false)
})
