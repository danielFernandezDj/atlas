type RecoveryError = { code?: string; status?: number }
type RecoveryResponse = { error?: RecoveryError | null }
export type RecoveryClient = {
  emailOtp: {
    requestPasswordReset(input: { email: string }): Promise<RecoveryResponse>
    resetPassword(input: {
      email: string
      otp: string
      password: string
    }): Promise<RecoveryResponse>
  }
}

type RecoveryResult = { ok: true } | { ok: false; message: string }
export const recoveryConfirmation =
  "If this email belongs to an account, a reset code is on its way. Check your inbox and spam folder."

export async function requestRecoveryCode(
  client: RecoveryClient,
  email: string
): Promise<RecoveryResult> {
  if (!email.trim()) return { ok: false, message: "Enter your email address." }
  try {
    const result = await client.emailOtp.requestPasswordReset({
      email: email.trim().toLowerCase(),
    })
    // Use the same acknowledgement for an unknown account; do not expose staff membership.
    if (!result.error || result.error.code === "USER_NOT_FOUND")
      return { ok: true }
    return {
      ok: false,
      message:
        result.error.status === 429
          ? "Too many requests. Wait a moment before requesting another code."
          : "We couldn’t request a reset code. Please try again.",
    }
  } catch {
    return {
      ok: false,
      message: "We couldn’t reach the password service. Please try again.",
    }
  }
}

export async function completePasswordRecovery(
  client: RecoveryClient,
  input: {
    email: string
    code: string
    password: string
    confirmation: string
  }
): Promise<RecoveryResult> {
  if (!/^\d{4,12}$/.test(input.code.trim()))
    return {
      ok: false,
      message: "Enter the numeric code from your reset email.",
    }
  if (input.password.length < 8 || input.password.length > 128)
    return {
      ok: false,
      message: "Use a password between 8 and 128 characters.",
    }
  if (input.password !== input.confirmation)
    return { ok: false, message: "The passwords don’t match." }
  try {
    const result = await client.emailOtp.resetPassword({
      email: input.email.trim().toLowerCase(),
      otp: input.code.trim(),
      password: input.password,
    })
    if (!result.error) return { ok: true }
    return {
      ok: false,
      message:
        result.error.status === 429
          ? "Too many attempts. Wait a moment, then request a new code."
          : "The password could not be reset. Check the code or request a new one.",
    }
  } catch {
    return {
      ok: false,
      message: "We couldn’t reach the password service. Please try again.",
    }
  }
}
