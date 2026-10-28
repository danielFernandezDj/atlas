# Next.js template

This is a Next.js template with shadcn/ui.

## Neon services

Neon Postgres and Managed Auth are configured in `neon.ts`. Run `neon deploy`
to provision the declared services and pull their connection URLs into `.env`.
The app uses pooled `DATABASE_URL` for requests and
`DATABASE_URL_UNPOOLED` for Prisma schema operations.

Managed Auth also requires an app-specific cookie secret. Set
`NEON_AUTH_COOKIE_SECRET` to a secure value of at least 32 characters in `.env`
and in the app's hosting environment; for example, generate one with
`openssl rand -base64 32`. Keep `.env` private.

## Adding components

To add components to your app, run the following command:

```bash
npx shadcn@latest add button
```

This will place the ui components in the `components` directory.

## Using components

To use the components in your app, import them as follows:

```tsx
import { Button } from "@/components/ui/button";
```

## Vercel builds

Use `pnpm run build` as the Build Command. It generates Prisma Client with the
project's `prisma7.config.ts` before running Next.js. The install hook also runs
generation, but the build does not depend on an install hook or cached artifacts.

The generator output directory is `lib/generated/prisma`; Prisma creates
`client.ts` inside it, matching the import in `lib/prisma.ts`. Generated files
remain ignored by Git. Changing this generator path does not change database
tables and does not require a migration.

Configure `DATABASE_URL`, `NEON_AUTH_BASE_URL`, and `NEON_AUTH_COOKIE_SECRET` in
the appropriate Vercel deployment environment. Keep secrets out of the repo.
If a Vercel project overrides the Build Command, it must still run
`pnpm run build` rather than invoking `next build` directly.

Next.js and its ESLint configuration are pinned to the patched 16.4.1 release.
Keep `pnpm-lock.yaml` committed so Vercel installs those exact resolved packages.
