## Current override: Neon, Clerk, and Vercel

The user explicitly requested Neon database hosting, Clerk login, and easy Vercel deployment. This supersedes the original Supabase/Render decisions below. The domain migrations remain ordinary PostgreSQL with an auth.uid() compatibility helper; there is no Supabase runtime service. Files are stored as small private bytea rows to avoid another account. Clerk verified subjects map to stable owner UUIDs. Server queries use pg over TLS with transaction-local roles. Vercel builds migrate under an advisory transaction lock; the Node worker uses authenticated Vercel Cron.

Current references: [Neon connection guide](https://neon.com/docs/connect/connect-from-any-app), [Clerk Next.js setup](https://clerk.com/docs/nextjs/getting-started/quickstart), [Clerk Vercel domains](https://clerk.com/docs/guides/development/deployment/vercel), [Vercel payload limits](https://vercel.com/docs/functions/limitations), [Cron plan limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

## Historical implementation decisions

# Architecture decisions

## 2026-09-15

- Empty repository; use Next.js App Router, strict TypeScript, React, Tailwind, Supabase Auth/PostgreSQL/Storage, Dexie, Zod, Vitest and Playwright. No second ORM. Exact installed versions are in package-lock.json; npm 11.6.2, Node 24.13.0 were used here.
- Public application shell contains no server-rendered private data. Browser SDK manages its supported session storage; every data request is checked by PostgreSQL RLS. Server API routes validate bearer tokens with `auth.getUser`. No production auth bypass and no seeded live owner.
- The profile row serializes owner mutations and change cursor allocation until commit. IDs and original payload hashes make capture retries idempotent. Revisions are append-only through privileged, explicitly granted RPCs.
- Local durable storage is opt-in, partitioned by owner/environment. Database commit is authoritative. AI processing is a separate durable job; no-AI capture is a real mode.
- Embedded PostgreSQL (PGlite) executes migration and RLS tests without Docker. These are actual SQL tests, not an in-memory JavaScript policy imitation. Supabase Auth/Storage gateway, pgvector extension, true multi-connection races, and hosted scheduler tests remain separate.
- Read-only integration tokens are high-entropy, hashed, bounded to explicit spaces/scopes, and revocable. SQL performs permission filtering. Change cursors are encrypted with a token-derived key so private activity counts are not exposed by decoding numeric cursors.
- OpenAI uses Responses with strict structured output, exact-source validation, configured model IDs and `store: false`. Model availability could not be verified against an account; there is no guessed default. Semantic search records model and 1,536 dimensions and falls back to keywords on unavailable/mismatched indexing.
- Every AI extraction is a reviewable suggestion, not an independently verified fact. Entity names are never silently merged. Human corrections fence stale jobs.
- Supabase Edge Function is the scheduled runtime. Jobs and notification attempts use leases and fencing. Push endpoints are restricted to supported provider domains to prevent server-side arbitrary URL requests. Push acceptance is not proof of display.
- Render's managed Node service + Supabase is the documented default deployment. No paid plan selected, no deployment created. Do not use a static-only host. Check current request/body/runtime limits before configuring archive limits.
- Interactive archives are deliberately bounded and refuse truncation. Large multipart archives and intentional cross-owner remapping remain required follow-up work, recorded in BUILD_STATE.md. Do not interpret a successful bounded export as unlimited backup capability.

## Official references checked

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation) and [PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps).
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [scheduled functions](https://supabase.com/docs/guides/functions/schedule-functions), [runtime limits](https://supabase.com/docs/guides/functions/limits), and [backup scope](https://supabase.com/docs/guides/platform/backups).
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) and [data controls](https://developers.openai.com/api/docs/guides/your-data). Format conformance does not establish factual support; `store: false` does not promise zero retention.
- [Official MCP TypeScript SDK v1](https://ts.sdk.modelcontextprotocol.io/).
- [Render Next.js deployment](https://render.com/docs/deploy-nextjs-app).
