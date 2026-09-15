# Build state — Remember

Specification: [BUILD_SPEC.md](BUILD_SPEC.md), v1.0, 15 September 2026.

**Release status: implementation preview. The complete v1 build contract is not yet fulfilled.** Do not deploy live private data based only on a green build. No hosted services or public deployment were created.

## Milestones

| Milestone | Implemented                                                                                                                                                                                                         | Gate status                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| M0        | Next.js/React/TypeScript/Tailwind, Supabase schema, invitation trigger, RLS, no-AI mode, generated row types, two-owner SQL tests                                                                                   | Local SQL passed; full Supabase Auth/Storage still external                                  |
| M1        | Typed capture, durable draft/operation transaction, owner partition, idempotent server save, sync/retry/undo, immutable revisions, timeline, keyword/date/space filters, trash, manifest/icons/public offline shell | Browser capture passed; Windows WebKit offline navigation unresolved; real iPhone open       |
| M2        | Versioned extraction schema/prompt, bounded chunk jobs, source validators, model-specific vector migration/adapter, source-only Ask fallback, AI answer adapter, event corrections and entity history               | Live model/vector evaluation open; richer review/entity/temporal features below              |
| M3        | Source-linked commitments/history, exact reminders, snooze/cancel/done, yearly birthday preparation with leap policy, durable delivery ledger, worker, protected Cron SQL, opt-in generic push                      | SQL tests passed; deployment/transport/device verification open; digest below                |
| M4        | Private file upload/download, MIME checks, bounded JSON/Markdown/byte ZIP, profile/source snapshot RPC, same-owner restore, Copy for AI, scoped token API/change feed, real folder-sync CLI and read-only MCP       | SQL/protocol tests passed; large archives/import remapping and hosted file verification open |
| M5        | Mobile layout, keyboard viewport handling, safe update prompt, reauthenticated purge, CSP/security headers, runbooks, CI, threat model and measured 10k fixture                                                     | Not release-approved; acceptance matrix remains partial                                      |

## Verified environment and work

- Original repository was empty. Node 24.13.0 / npm 11.6.2 used; lockfiles committed.
- PGlite executes PostgreSQL migrations/RLS and restore tests; generated data remains synthetic.
- Docker and a configured Supabase project were unavailable. No live credentials were supplied.
- Typecheck/lint/unit+SQL+protocol tests/build/Deno checks and production browser tests run; see TEST_RESULTS.md for exact counts and limitations.
- Last measured 10k timeline SQL p95: 26.48 ms on this Windows machine, excluding network and phone behavior.

## Migrations

001 core ownership/capture/revisions/jobs; 002 retrieval/budget; 003 scoped integrations/restore; 004 private Storage; 005 fenced extraction/delivery; 006 corrections/moves/keyset timeline/security; 007 optional pgvector; 008 reminder guards/annual preparation; 009 lifecycle/rate limits/chunk jobs; 010 purge authorization; 011 bounded consistent archive snapshot.

All non-Storage/non-vector migrations are applied during the type-generation check. Integration tests exercise selected complete chains. **No migration was applied to a live Supabase project.**

## Required software still unfinished (not v2 deferrals)

1. Large, resumable multipart archives; filtered exports; intentional cross-owner ID remapping with preview; richer import collision previews and plain-text/Markdown import UI.
2. Complete entity resolution/merge/unmerge audit UI, claim review/supersession and completion-evidence linking; person/topic/source-type/unresolved-action timeline filters.
3. Explicit recorded-as-of retrieval and complete bitemporal semantics in Ask. Exact-quote validation does not prove semantic entailment; attribution/date/uncertainty evaluation needs expansion.
4. Full-note semantic indexing beyond the current 20,000-character embedding limit, owner-facing reindex controls, measured token/currency accounting, and a tested compatible-provider adapter. Chunked extraction already preserves full originals.
5. Daily digest, configurable preparation-template UI beyond 30/7/1, fully surfaced failed delivery/retry states, and an actual browser-closed scheduler test.
6. Durable offline attachment queue, attachment-orphan cleanup, automatic 30-day trash purge, and an independent scheduled encrypted backup/restore procedure.
7. Copy-for-AI mode/budget preview and explicit one-export policy override; scoped integration attachment-download permission. Non-change API pagination uses bounded opaque offsets, while the change feed has the stronger serialized cursor contract.
8. Broader security/failure/performance acceptance tests: actual multi-session commit races, malicious restore relationship edge cases, service-worker upgrade with queued work, local-save p95 on target phone, and full keyboard/screen-reader/device verification.

## External blockers / owner configuration

Supabase project URL/public key/service-role secret in local/server secret stores; invited owner provisioning; optional explicit AI model IDs/key; worker/Vault secret; VAPID values; authorized hosting deployment; independent backup destination; a real iPhone. Do not ask for passwords in chat.

## Next exact implementation steps

1. Finish and test the outstanding archive/import paths first: add multipart manifests and bounded part generation/restoration while preserving transaction snapshots, owner remapping and inactive reminder guarantees.
2. Reproduce the Windows WebKit offline failure using FORCE_WEBKIT_OFFLINE=1; validate on macOS and a real iPhone. Do not mark the skipped check passed.
3. Start the complete Supabase stack in an isolated environment; apply migrations 004/007 and run Auth/Storage/vector plus multi-session concurrency tests.
4. Work through the remaining required software list and ACCEPTANCE_MATRIX.md before production deployment.

## Explicit v2 exclusions retained

Native iOS/App Store, continuous recording, meeting bots, automatic email/calendar ingestion, WhatsApp, team workspaces/billing/public sharing, OCR/PDF analysis, web research inside answers, hosted remote MCP, outbound writes and webhooks.
