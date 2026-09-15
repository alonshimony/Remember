# Remember

A private, mobile-first memory timeline. Capture a conversation, decision or promise in your own words, then find it through your timeline, source retrieval and optional AI.

**Status: implementation preview; not yet approved for production.** The working capture, persistence, review, reminders, portability and integration paths are implemented. Required gaps and environmental verification are tracked explicitly in [BUILD_STATE](docs/BUILD_STATE.md). Nothing has been publicly deployed.

## Quick start

Prerequisites: Node 24 LTS, npm 11.6.2, Docker Desktop and the Supabase CLI. No paid AI account is required.

```sh
npm ci
npx supabase start
npx supabase db reset
```

Copy `.env.example` to `.env.local`. Fill the local URL, public/anon key and service-role key printed by `supabase status`. Leave `AI_PROVIDER=none`. The service-role value is server-only.

Provision the invited owner by supplying `OWNER_EMAIL` and `OWNER_PASSWORD` in the process environment, then run:

```sh
node --env-file=.env.local --import tsx tools/provision-owner.ts
npm run dev
```

Open [localhost:3000/capture](http://localhost:3000/capture), sign in, and enable trusted-device storage if this is your personal browser. The provisioning script creates the allowlist entry before the account and sends no email. There is no hard-coded live owner and no public signup.

On Windows, `Copy-Item .env.example .env.local` works. Environment variables can be set through PowerShell or your local secret manager. Do not paste passwords or keys into a chat or commit `.env.local`.

Without Supabase configuration, the app displays setup instructions; it does not pretend to save. The SQL tests use embedded PostgreSQL and work without Docker. Docker was not installed on the development machine, so the full Supabase local-start commands above remain environment verification steps.

## Daily use

- **Capture:** type, paste, or use your phone keyboard's dictation. Save needs no title or tags. Device save and server sync have separate status messages. Attach files from the saved memory.
- **Timeline:** filter by space/date and keyword; open a memory for the original, immutable revisions, corrections, privacy controls and commitments.
- **Ask:** without AI, view keyword-matched original sources. With account consent, provider configuration and permitted notes, receive validated source-linked answers. Semantic retrieval is optional and model-specific.
- **Upcoming:** confirm suggested commitments, mark done/cancelled, schedule an explicit reminder, or approve annual birthday preparation. Notification delivery needs a configured backend scheduler and an opted-in device.
- **iPhone:** visit the HTTPS deployment in Safari → Share → Add to Home Screen. Initialize online first. Real iPhone installation, keyboard behavior and push receipt still require manual testing.
- **Backup/restore:** Settings → Your data downloads a private ZIP. Inspect its manifest. Preview before restoring; old reminders are disabled pending review. Archives can contain no-AI notes and must not automatically be sent to a model.
- **Second brain:** Settings → Connections creates scoped read-only tokens. See [INTEGRATIONS](docs/INTEGRATIONS.md) for HTTP, folder sync and local MCP.

## Verification commands

```sh
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium webkit
npm run test:e2e
npx deno check --config supabase/functions/worker/deno.json supabase/functions/worker/index.ts
```

See [TEST_RESULTS](docs/TEST_RESULTS.md) for actual runs and the distinction between database tests, mocked browser transport, real protocol tests and external/manual tests.

Additional tools:

```sh
npm run db:types
npm run archive -- inspect /path/to/remember-backup.zip
npm run archive -- export /path/to/new-backup.zip
npm run sync -- --folder /path/to/remember --dry-run
npm run mcp
```

Archive export requires a short-lived owner access token in `REMEMBER_OWNER_ACCESS_TOKEN`; an integration token intentionally cannot read the full private archive. The CLI validates archive completeness and uses exclusive file creation.

## Deployment and operations

[DEPLOYMENT](docs/DEPLOYMENT.md) documents managed Next.js on Render + Supabase, invitation setup, private storage, worker secret, Vault/Cron, HTTPS and rollback. [OPERATIONS](docs/OPERATIONS.md) covers backups and restoration. [SECURITY](docs/SECURITY.md) describes boundaries and known risks. Official dependency references and decisions are in [DECISIONS](docs/DECISIONS.md).

No analytics, public sharing, billing, inbox integration or autonomous outbound messaging is included.
