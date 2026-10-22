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
