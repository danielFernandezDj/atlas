/**
 * Creates the browser Neon Auth client used by AuthPanel, recovery and account controls.
 * It calls the configured auth API; staff permissions are still checked server-side.
 */
import { createAuthClient } from "@neondatabase/auth/next"

export const authClient = createAuthClient()
