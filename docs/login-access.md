# Login-only access

Atlas accepts existing email/password accounts. The login form has no public
registration action, and every method of `/api/auth/[...path]` is wrapped in a
login-only allowlist. Signup, social/anonymous sign-in and unrecognized endpoints
return HTTP 403 before reaching Neon. Existing login, session, sign-out,
verification and password recovery flows remain available.

The configured Neon production branch must also disable email/password signup:

```sh
neon neon-auth config email-password update --project-id small-union-62628392 --branch production --disable-sign-up true
```

Check that `disable_sign_up` is true with `email-password get`. This setting is
managed in Neon, separately from a Git commit or an Atlas deployment. Check it
when enabling Auth on any new branch. Do not disable email/password login itself.
The unused default Google provider was removed after confirming there were no authentication accounts. There are no configured social providers. Do not enable social or other implicit signup flows without an explicit account-provisioning policy.

## Provisioning an approved staff member

1. Create the identity using Neon Auth user-management tools or its supported
   administrative API, not direct inserts into the managed `neon_auth` tables.
2. Finish the supported credential setup and ensure the email is verified.
3. Add a row to `public.users` using the same email, their first/last name, the
   appropriate Atlas role, and `is_active = true`.

`neon_auth.user` is the login identity. `neon_auth.account` holds authentication
provider/credential records. Neon manages these and the associated sessions.
`public.users` is the application staff record with an integer ID used by
movement and audit history. The two IDs do not have to match: the current Atlas
access check links the accounts by verified email. Passwords never belong in
`public.users`. Match the email exactly, including its normalized casing.

Creating an Auth account alone does not grant dashboard access. Atlas also
requires an active staff record. Disabling that record revokes dashboard access
on the next server read. Currently all active staff roles can read all sites;
the dashboard has no operational write endpoints.

Run `node --test tests/login-only.test.mjs tests/dashboard-read.test.mjs` to check
that signup cannot reach the authentication provider and unapproved users cannot
read inventory. A direct-service check should confirm Neon rejects public signup
without creating an account; do not test with real user credentials.

## Password recovery

The sign-in form links to `/reset-password`, a public recovery page. Atlas uses
Neon's email-code flow with the existing shared email provider:

1. `authClient.emailOtp.requestPasswordReset({ email })` sends the reset code.
2. The user enters the code, a new password and its confirmation in Atlas.
3. `authClient.emailOtp.resetPassword({ email, otp, password })` verifies the code
   and writes the new password hash through Neon Auth.
4. The user returns to sign-in and uses the new password.

The proxy allowlist includes only the two additional recovery endpoints:
`email-otp/request-password-reset` and `email-otp/reset-password`. Signup and
alternate implicit account-creation flows remain blocked. Recovery does not
create a staff record or change roles or email verification requirements.
The same request acknowledgement is shown for unknown accounts. Neon enforces
code expiry, validity and attempt limits; Atlas adds a resend cooldown. Password
and code values remain in component state and are cleared on completion or when
changing email. They are not put in URLs, logs or browser storage. Passwords are
8–128 characters under the current default Auth password policy.

For a manually inserted malformed credential, use this recovery flow to replace
the stored value with a real password hash. Do not edit hashes manually or delete
the user. Complete verification with the code from the user's own inbox, then
confirm normal login works. An accepted send request does not prove inbox delivery.
