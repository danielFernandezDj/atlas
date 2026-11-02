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
