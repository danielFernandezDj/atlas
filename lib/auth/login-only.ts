/**
 * Wraps the auth handler with Atlas’s existing-account endpoint allowlist.
 * The auth API route uses this boundary to block registration and alternative flows
 * that could create users, while preserving login, sessions and password recovery.
 */
import type { NextRequest } from "next/server"

type AuthContext = { params: Promise<{ path: string[] }> }
type AuthHandler = (
  request: NextRequest,
  context: AuthContext
) => Promise<Response>

// Only the existing-account flows used by Atlas are exposed. Unknown endpoints
// fail closed, including social/anonymous/OTP sign-in that might create users.
const existingAccountRoutes = new Set([
  "sign-in/email",
  "sign-out",
  "get-session",
  "token",
  "jwks",
  "email-otp/request-password-reset",
  "email-otp/reset-password",
  "request-password-reset",
  "reset-password",
  "verify-email",
  "send-verification-email",
  "email-otp/verify-email",
  "email-otp/send-verification-otp",
])

function normalizedPath(segments: string[]) {
  let path = segments.join("/")
  try {
    for (let count = 0; count < 3; count++) {
      const decoded = decodeURIComponent(path)
      if (decoded === path) break
      path = decoded
    }
  } catch {
    return ""
  }
  return path
}

export function loginOnly(handler: AuthHandler): AuthHandler {
  return async (request, context) => {
    const params = await context.params
    const path = normalizedPath(params.path)
    if (!existingAccountRoutes.has(path)) {
      return Response.json(
        {
          code: "AUTH_ACTION_DISABLED",
          message:
            "Public registration is disabled. Contact your Atlas administrator.",
        },
        {
          status: 403,
          headers: { "Cache-Control": "no-store" },
        }
      )
    }
    return handler(request, { params: Promise.resolve(params) })
  }
}
