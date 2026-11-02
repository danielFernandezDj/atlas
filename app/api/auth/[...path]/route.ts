import { auth } from "@/lib/auth/server"
import { loginOnly } from "@/lib/auth/login-only"

const handlers = auth.handler()

export const GET = loginOnly(handlers.GET)
export const POST = loginOnly(handlers.POST)
export const PUT = loginOnly(handlers.PUT)
export const DELETE = loginOnly(handlers.DELETE)
export const PATCH = loginOnly(handlers.PATCH)
