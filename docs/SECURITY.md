# Security model

## Boundaries

The database and configured model provider can read permitted text. This is not end-to-end encryption. All spaces are owner-only; space membership is also enforced on composite relationships. Authenticated browser access cannot mutate revisions, capture rows or jobs directly. Server-side invitation enforcement blocks public account creation even if a signup endpoint is called directly.

Offline plaintext is accessible to an unlocked browser and malicious same-origin JavaScript. Do not enable trusted-device storage on shared devices. Signing out offers export/sync/discard for unsynced operations and deletes that owner's local database. Browser eviction can remove local notes: only server acknowledgement means synced.

## Threats and mitigations

| Threat                       | Implemented control                                                                              | Remaining verification                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Owner B guesses owner A's ID | RLS, composite owner/space foreign keys, API user validation                                     | Hosted Auth/Storage gateway                           |
| Stolen integration token     | Hash-only storage, expiry, revocation, explicit scopes, SQL filters, 60 requests/minute          | External secret storage belongs to client             |
| Private scope change         | Encrypted change cursors, minimal tombstones, source-policy rechecks                             | True concurrent commit stress test                    |
| XSS / imported markup        | React text rendering, no Markdown HTML rendering, MIME/content checks, CSP, download disposition | CSP nonce hardening remains desirable                 |
| Malicious ZIP                | Path, expanded-size, file-count, manifest hash, owner and SQL FK validation                      | Large multipart / intentional remapping not supported |
| Malicious note prompt        | Untrusted-data prompts, no model tools, fixed provider URLs, quote/source validators             | Live-model semantic evaluation                        |
| Stale AI result              | Current revision, policy, consent, deletion and fencing rechecked in apply transaction           | Privacy changes cannot undo transmitted requests      |
| Forged worker call           | Worker bearer secret; public project key is insufficient                                         | Hosted gateway invocation                             |
| Push SSRF                    | Database endpoint allowlist; generic lock-screen content                                         | Real device receipt and provider transport            |
| Unsafe folder deletion       | UUID names, managed-file manifest, no recursive deletion, symlink rejection, atomic replacement  | Destination filesystem semantics vary                 |

Only server/worker environments receive the service-role key. Never put it in a `NEXT_PUBLIC_` variable. API tokens never belong in URLs. The app logs error categories and internal operation IDs, not raw memories or provider prompts.

Trash immediately removes memories from active retrieval and integrations. Explicit permanent deletion requires reauthentication at the server API. Downloaded backups, old exports, third-party logs and retained database backups cannot be recalled. Automatic 30-day trash cleanup is not yet enabled; do not claim a retention guarantee.

Keep production and synthetic testing in separate Supabase projects. Never run test seeds or reset migrations on production. No live account data was used during development.
