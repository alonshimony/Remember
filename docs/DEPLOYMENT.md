# Deployment: Neon + Clerk + Vercel

## Fast path

Use a fresh, dedicated Neon database with its default owner role. Copy the pooled connection string from Neon **Connect**. It should retain TLS parameters such as `sslmode=require`. The server uses the `pg` driver and transaction-local role changes, compatible with Neon's pooled connections.

Create a Clerk application and configure email sign-in. Create or invite your own account, then verify the email address. `OWNER_EMAIL` must match that verified email. Remember rejects other identities even if Clerk allows them to register. For an invitation-only Clerk experience, also configure restricted sign-up in Clerk.

Import `alonshimony/Remember` into Vercel and add:

```dotenv
DATABASE_URL=postgresql://.../neondb?sslmode=require
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
OWNER_EMAIL=you@example.com
```

Use **Next.js**, root `./`, Node **24.x**. Keep the repository build command (`npm run vercel-build`). Do not override it with `npm run build`, which deliberately does not migrate the database.

Click Deploy. Migrations and the owner invitation run automatically; first verified Clerk sign-in creates the corresponding UUID owner and default spaces. `APP_URL` is optional because browser requests use same-origin URLs. No callback URL, webhook, password in Vercel, or Supabase credentials are needed.

## Domains and Clerk instances

For an initial test on Vercel's generated `*.vercel.app` address, use Clerk development keys. For live production, add a domain you own to Vercel, create Clerk's production instance, complete its DNS setup, and switch both Clerk keys to that instance's production keys. Clerk production keys do not work on `*.vercel.app`.

Clerk development and production identities are different. Use separate Neon branches/databases for those environments. If you need to transfer an existing workspace between Clerk instances, do a deliberate identity mapping migration after verifying the new account; the app never silently transfers private data based on a matching email.

Official guides: [Clerk on Vercel](https://clerk.com/docs/guides/development/deployment/vercel), [Clerk environments](https://clerk.com/docs/guides/development/managing-environments), [Neon connections](https://neon.com/docs/connect/connect-from-any-app).

## Migrations and access control

`npm run db:migrate` is also available locally. It loads `.env.local`, takes a PostgreSQL transaction lock, checks migration checksums, and applies only pending migrations. Failures roll back the transaction and fail the deployment. It never resets the database or drops existing data.

`db/bootstrap.sql` defines the identity table and the `auth.uid()` compatibility function. These are ordinary PostgreSQL objects, not dependencies on Supabase Auth. The original domain SQL remains in `db/migrations`; the historical `_storage` migration is excluded and replaced by `db/files.sql`. Authenticated requests run with `SET LOCAL ROLE authenticated` and a transaction-local verified owner UUID. Workers use server credentials. Browser requests cannot call privileged worker/purge functions.

Use a dedicated database because the migrations create the application's public schema objects. This is a fresh Neon deployment path, not an automatic migration of an already populated Supabase database. If existing data must move, export and verify it before deliberately mapping owner IDs and moving attachment bytes.

For another invited owner, add their verified email to `invited_owners` through the trusted database console. Do not grant public signup database privileges. Remove their invitation to revoke app access. Changing `OWNER_EMAIL` adds an invitation at deployment; it does not remove earlier invitations or transfer their data.

## Attachments and archives

Private bytes are stored in Neon with PostgreSQL RLS and foreign keys to attachment metadata. Downloads require an active Clerk session on every request. No public storage URLs are created. Deleting attachment metadata cascades to its bytes.

Files are limited to **3 MB each**. Interactive archives allow **3 MB aggregate attachment bytes** and **4 MB ZIP uploads/downloads**. These bounds leave room below Vercel's 4.5 MB function payload limit. Large multipart archives remain a product gap; this app does not claim to support them. Neon database/backup usage includes file bytes.

[Official Vercel function limits](https://vercel.com/docs/functions/limitations).

## Worker, AI, and push

Basic capture/search needs no worker credentials. For scheduled work:

1. Set `CRON_SECRET` to a random secret of at least 32 characters in Vercel.
2. The checked-in daily schedule calls `/api/cron`; Vercel sends `Authorization: Bearer <CRON_SECRET>` automatically.
3. For timely reminders and extraction, use `* * * * *` on a plan supporting per-minute jobs, or call the same route from an external scheduler with the bearer secret. Vercel Hobby is limited to once daily and does not guarantee exact invocation time. The worker processes bounded batches and uses durable leases and retry state.
4. For AI, set `AI_PROVIDER=openai`, `OPENAI_API_KEY`, explicit extraction/answer model IDs, and optionally an embedding model supporting 1,536 dimensions. Enable account consent in Settings. `AI_PROVIDER=none` is the default.
5. For web push, generate keys with `npx web-push generate-vapid-keys`, then set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT=mailto:you@example.com` in Vercel. Opt in from the installed app. Provider acceptance is not proof of device receipt.

[Scheduling limits](https://vercel.com/docs/cron-jobs/usage-and-pricing) and [securing Cron](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

## Troubleshooting

- **Migration permission error:** use Neon's database-owner connection for initial setup; it must create roles, schemas, and the vector extension. Do not use a pre-existing `authenticated` role with login or RLS-bypass privileges.
- **Configure Clerk keys:** add both keys from the same Clerk instance, then redeploy. Public keys are embedded at build time.
- **Not invited:** verify the email in Clerk and check `OWNER_EMAIL` before redeploying. The invite is keyed by the verified primary email at first sign-in.
- **Email exists under another Clerk identity:** use the original Clerk instance, or perform a reviewed identity migration. Automatic relinking is intentionally refused.
- **Clerk production-key domain error:** use the configured custom domain and its DNS, or development keys for a preview.
- **Permanent deletion fails with passwordless login:** the existing purge flow rechecks your password through Clerk. Add a password in Clerk first. Normal trash/restore does not require a password.
- **Worker returns 401:** configure `CRON_SECRET` and use its exact bearer value. An ordinary login or public Clerk key is not a worker credential.
- **Reminders are late:** check the schedule/plan and worker heartbeat in Settings. The default is daily.

## Release checks and operations

Verify real Clerk sign-in/sign-out, capture/reload, two-owner isolation, private file download, restore, and worker execution after deployment. Use staging data until the remaining gates in BUILD_STATE are completed. Existing product gaps remain; this migration does not close all of them.

Take and verify an independent encrypted backup before upgrades. Neon restore/branching and independent archive backups serve different purposes; test both. Include file bytes and identity mappings. Use forward SQL migrations; rolling back a Vercel build does not roll back the database. Keep Cron disabled in restore test environments.
