# Verification evidence

Date: 15 September 2026. Environment: Windows, Node 24.13.0, npm 11.6.2. All data was synthetic. No paid model, real messages, live owner data or public deployment was used.

## Executed successfully

- `npm run typecheck`: strict TypeScript check.
- `npm run lint`: ESLint, no errors or warnings at the recorded code check.
- `npm test`: 32 tests across 7 files passed in the final run, including the archive snapshot and same-owner restore checks.
- `npm run build`: optimized Next.js build succeeds. Browser tests also build and start the production application.
- `npx deno check --config supabase/functions/worker/deno.json supabase/functions/worker/index.ts`: worker type-check passes using its own dependency lock.
- `npm run db:types`: applies non-extension SQL migrations and generates checked-in row types. Storage/pgvector types require a full Supabase instance.
- `npm run test:e2e`: 9 browser tests passed, 1 explicitly skipped on Windows WebKit (see below).
- `npx tsx tools/benchmark.ts`: 10,000 synthetic captures and linked entities; 30 warm in-process timeline queries: p50 **23.28 ms**, p95 **26.48 ms**, maximum **35.96 ms**. Excludes network latency; not an iPhone capture-save benchmark.
- Dependency installation reported zero npm audit vulnerabilities. This is a point-in-time dependency audit, not a security certification.

## What is real versus substituted

| Area                | Verification                                                                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database            | Actual PostgreSQL via PGlite applies core, retrieval, integration, worker and hardening migrations. Tests supply Supabase-compatible auth roles/`auth.uid()`; they do not imitate RLS in JavaScript. |
| Two-owner isolation | Actual RLS denial, guessed IDs, forged relationships, immutable revision mutation denial, privileged job RPC denial.                                                                                 |
| Save/retry          | Actual idempotency SQL, original payload conflict, local Dexie transactions, failed storage rollback, owner guard, racing undo.                                                                      |
| AI                  | Deterministic quote/citation/date/policy invariants. No live Responses or embedding call.                                                                                                            |
| Reminders           | SQL delivery deduplication, fencing, cancellation, annual leap-day preparation and independent years. No real push service used.                                                                     |
| Restore             | Two independent PostgreSQL instances; preserved original/revision text, counts, relationships, policies and inactive restored reminders. Archive byte/hash checks run separately.                    |
| Folder sync         | Real child process against synthetic local HTTP; retry, tombstones and preservation of unrelated files.                                                                                              |
| MCP                 | Real SDK client/stdio handshake, five read-only tools, write-like request rejected with protocol error.                                                                                              |
| Browser interaction | Production Next.js in Chromium/WebKit, mocked Supabase transport; real browser IndexedDB. Mocked tests block service workers because active workers bypass routing in WebKit.                        |
| PWA                 | Separate production Chromium test uses the real service worker and reopens the public shell offline, with no mocked auth/data transport.                                                             |
| UI                  | 320px screenshot visually inspected; overflow assertions pass. Actual software keyboard and assistive technology remain manual.                                                                      |

## Unresolved Windows WebKit offline navigation

The service-worker offline-navigation test repeatedly fails with `page.reload: WebKit encountered an internal error` under Windows WebKit 26.6. Production Chromium passes. We have not established whether the remaining cause is platform automation or application behavior, so the iPhone/offline release gate stays open.

This one test is explicitly skipped only on Windows WebKit by default. It is not counted as passed. Reproduce from PowerShell:

```powershell
$env:FORCE_WEBKIT_OFFLINE='1'
npx playwright test pwa.spec.ts --project=webkit-mobile
```

Re-run on macOS/WebKit and an actual iPhone before release. [Playwright's service-worker documentation](https://playwright.dev/docs/service-workers) describes separate request-routing constraints; it does not prove this particular failure is harmless.

## Still external / manual

- Docker/Supabase startup; complete Storage/pgvector migrations; hosted auth/invitation, signed downloads and actual object restoration.
- Concurrent PostgreSQL sessions, cursor/commit races and extended failure injection.
- Live OpenAI model compatibility, token accounting, bilingual retrieval and F1–F8 evaluation.
- Protected deployed Cron with the app closed; real push acceptance and iPhone receipt.
- iPhone installation/reopening/dictation, storage eviction, software keyboard, screen reader and update lifecycle.
- Independent encrypted backup destination and full hosted recovery drill.

See ACCEPTANCE_MATRIX.md for the full checklist. Partial coverage is not release signoff.

## Final verification follow-up

The final archive snapshot/profile follow-up passed `npm run typecheck`, `npm test` (32/32) and `npm run build`. Repository source scans found no matching private-key patterns; the browser static bundle scan found none of the server-secret variable names (OpenAI key, service-role key, worker secret or private VAPID key). These scans do not replace a full penetration test.
