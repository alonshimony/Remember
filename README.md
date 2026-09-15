# Remember

A private, mobile-first memory timeline. Capture a conversation, decision, or promise in your own words and find it later.

**Stack: Next.js + Neon Postgres + Clerk + Vercel.** No Supabase account, Docker, separate storage account, or AI key is required.

## Deploy on Vercel

1. **Neon:** in your existing account, create a project/database for Remember. Open **Connect**, enable pooling, and copy the connection string. Use the default database-owner role for the initial schema setup.
2. **Clerk:** create an application, enable email sign-in, and copy its publishable and secret keys. Create or invite your account in Clerk and verify your email. For a first deployment on `*.vercel.app`, use Clerk development (`pk_test_` / `sk_test_`) keys. Clerk production keys require your own domain and Clerk's DNS setup.
3. Open [Vercel New Project](https://vercel.com/new), import **alonshimony/Remember**, and leave **Framework: Next.js**, **Root directory: ./**, and **Node: 24.x**.
4. Add these four environment variables before clicking **Deploy**:

| Variable                            | Value                                               |
| ----------------------------------- | --------------------------------------------------- |
| `DATABASE_URL`                      | Neon pooled Postgres connection string              |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key                               |
| `CLERK_SECRET_KEY`                  | Clerk secret key from the same application/instance |
| `OWNER_EMAIL`                       | Your verified Clerk email                           |

The checked-in `vercel.json` selects the build command. Each deployment applies pending SQL migrations under a transaction lock, then builds Next.js. On first Clerk sign-in, Remember creates your private workspace automatically. There is no password-provisioning command or webhook to configure.

Use a dedicated Neon database or branch for this app. For Vercel previews, use a separate Neon branch and Clerk development keys; do not point unreviewed preview builds at your live database. Secrets stay in Vercel's environment settings. Only the Clerk publishable key belongs in the browser.

[Detailed deployment, domain, scheduler, and troubleshooting guide](docs/DEPLOYMENT.md).

## Run locally

Install Node 24, then:

```sh
npm ci
```

Copy `.env.example` to `.env.local` and fill in the four required values above. On Windows: `Copy-Item .env.example .env.local`.

```sh
npm run db:migrate
npm run dev
```

Open [localhost:3000/capture](http://localhost:3000/capture) and sign in with Clerk. Use Clerk development keys locally. The same Neon database works locally; use a development branch to isolate test data.

## What works

- Capture, immutable revisions, timeline, keyword search, spaces, corrections, and trash.
- Clerk sign-in, invitation-only workspace access, and SQL row-level owner isolation.
- Trusted-device offline drafts and a persistent sync queue.
- Private attachments stored in Neon (up to **3 MB per file**, 10 per memory).
- Archive export/import, scoped integration tokens, folder sync, and local MCP.
- Optional AI extraction and source-linked answers, reminders, and web push.

The project remains an implementation preview. [BUILD_STATE](docs/BUILD_STATE.md) lists the remaining product gaps and external verification. No live Neon/Clerk account or Vercel deployment was configured as part of this code change.

## Background work

For AI extraction and push reminders, set `CRON_SECRET` to a long random value. Vercel invokes `/api/cron` with that secret. The default schedule is **once daily**, compatible with Vercel Hobby. For frequent processing, use Vercel Pro with `* * * * *` in `vercel.json`, or an external scheduler that sends the same bearer secret. Daily scheduling is not suitable for exact-time reminders or a busy extraction queue.

Optional AI and push variables are listed in `.env.example`. No-AI capture and keyword search work without them. The worker uses Node on Vercel; no Edge Function or Supabase Cron/Vault setup remains.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium webkit
npm run test:e2e
```

SQL tests run embedded PostgreSQL with pgvector, including the Neon schema, without a Neon account. Browser transport tests use synthetic API responses; live Clerk, Neon networking, and device push still need verification after configuring your accounts. See [TEST_RESULTS](docs/TEST_RESULTS.md).

Additional tools: `npm run db:types`, `npm run archive -- inspect file.zip`, `npm run sync -- --folder ./memory --dry-run`, and `npm run mcp`. See [INTEGRATIONS](docs/INTEGRATIONS.md).
