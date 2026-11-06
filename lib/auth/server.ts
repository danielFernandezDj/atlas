/**
 * Configures the server Neon Auth integration from deployment environment settings.
 * Pages, API access helpers and the auth route use it to obtain sessions and handlers;
 * application inventory remains in the separate Prisma services.
 */
import { createNeonAuth } from "@neondatabase/auth/next/server"

const baseUrl = process.env.NEON_AUTH_BASE_URL
const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET

if (!baseUrl) {
  throw new Error("NEON_AUTH_BASE_URL is not configured")
}

if (!cookieSecret) {
  throw new Error("NEON_AUTH_COOKIE_SECRET is not configured")
}

export const auth = createNeonAuth({
  baseUrl,
  cookies: { secret: cookieSecret },
})
