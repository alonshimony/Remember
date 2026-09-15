# Deployment runbook

Do not deploy this preview for live private data until the remaining release gates in BUILD_STATE.md are satisfied. No hosting account, subscription or public deployment was created during implementation.

## 1. Staging database

Create an isolated Supabase project. Disable public signups. Apply every migration in numeric order through the CLI or your controlled migration pipeline. The `invited_owners` trigger is an additional server-side allowlist. Verify two-user policies before adding live data.

```sh
npx supabase login
npx supabase link --project-ref YOUR_STAGING_REF
npx supabase db push
```

Do not run `db reset` against a hosted production project. Migration 004 creates a private attachment bucket and its RLS policies. Migration 007 requires Supabase's pgvector extension. The application remains useful without an AI key; keep `AI_PROVIDER=none` until intentionally configured.

Provision the account using the environment-based script described in README. Use Supabase's admin dashboard to set the correct site URL and allowed redirect URLs to the final HTTPS origin. Use a separate project and keys for production.

## 2. Managed Next.js service

The supplied `render.yaml` is a blueprint for a **Node web service**, not a static site. Connect the repository to Render after deployment authorization. Build with `npm ci && npm run build`; start with `npx next start --hostname 0.0.0.0 --port $PORT`.

Set public database URL/key at build time because Next.js embeds public variables. Set APP_URL and server-only service-role key in the service secret store. Use HTTPS. Confirm the selected hosting plan supports your desired availability and body/runtime limits. The app enforces 10 MB attachments, 40 MB aggregate interactive archive attachments and a 60 MB compressed import cap; reduce these or use another appropriate Node service if its gateway is more restrictive. Do not select a plan based on an assumed free allowance.

## 3. Optional AI

Set AI_PROVIDER=openai, OPENAI_API_KEY and explicit OPENAI_EXTRACTION_MODEL / OPENAI_ANSWER_MODEL. Verify those model IDs in the configured account before enabling consent. Optionally set OPENAI_EMBEDDING_MODEL; it must support 1,536-dimensional embeddings. Keep model identity with each index. A model change needs reindexing; unmatched indexes fall back to keywords. Notes over 20,000 characters currently have lexical retrieval only, although extraction is chunked.

Set the per-owner daily request limit and a provider-side monetary spend cap. The application request cap is not a guaranteed currency budget. Provider token usage/cost accounting still needs the work listed in BUILD_STATE. `store: false` is not a zero-retention contract.

## 4. Worker and reminders

Create a high-entropy WORKER_SECRET and keep it in both Supabase Function secrets and Vault. Set provider values separately in the Function environment. The web service's environment does not automatically configure an Edge Function.

```sh
npx supabase functions deploy worker --no-verify-jwt
```

The function verifies the exact worker bearer secret itself. `verify_jwt=false` does **not** make it public: requests without that secret receive 401. Test that a public project key is rejected.

Generate your VAPID public/private key pair using a standards-compatible tool. Store the private key and VAPID_SUBJECT only in the worker environment; expose only the public key to the app's authenticated configuration route. Set the same public key in the web service.

Create Vault entries named `project_url` and `worker_secret`, then execute `supabase/schedule.sql`. It invokes the worker every minute; this is approximate scheduling, not exact-time or exactly-once delivery. Inspect invocation and delivery ledgers. Disable the Cron job in restore test projects. Never put actual secrets into the committed scheduler SQL.

## 5. Release checks

1. Run the clean install/build/test suite and the full-stack two-owner tests in staging.
2. Save/reopen offline on an actual iPhone; verify original text and the same-owner queue.
3. Opt in to push from the installed PWA. Close the browser and verify the backend attempts delivery. Record actual receipt separately from provider acceptance.
4. Export an archive with attachment bytes, restore into an isolated database/storage environment and compare counts/hashes/relationships.
5. Configure and test an independent encrypted backup destination. Until then, health must continue to say **External backup not configured**.
6. Test API revocation and downstream deletion after a privacy/scope change.

## Rollback / upgrades

Take a complete verified backup first. Prefer forward-fix SQL migrations; do not drop data to roll back the frontend. Retain immutable revisions and client operation UUIDs. IndexedDB upgrades are additive. The service worker does not call skipWaiting automatically; a tab with drafts/queued notes is not force-reloaded by an update. Close and reopen only after saving; explicit update prompting remains in BUILD_STATE.

## Costs

Cost categories are application hosting, Supabase compute/database/storage/egress and recovery plan, optional model usage, domain registration and an independent backup destination. No guaranteed monthly total is claimed. Verify current provider plans against expected note, file, query and notification volume.
