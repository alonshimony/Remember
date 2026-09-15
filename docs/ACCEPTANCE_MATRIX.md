# Acceptance matrix

Every ID from the supplied specification is retained. Partial coverage means a narrower automated invariant exists, not that the whole acceptance scenario passed. See TEST_RESULTS.md and BUILD_STATE.md.

| ID  | Scenario                                                      | Status                                        |
| --- | ------------------------------------------------------------- | --------------------------------------------- |
| C01 | Open installed app with an existing valid session             | Partial automated coverage; release gate open |
| C02 | Save plain text without any AI key                            | Partial automated coverage; release gate open |
| C03 | Double-tap Save                                               | Partial automated coverage; release gate open |
| C04 | Server commits but acknowledgement is lost; client retries    | Partial automated coverage; release gate open |
| C05 | Same operation key reused with changed text                   | Partial automated coverage; release gate open |
| C06 | Save offline after prior setup; close/reopen; reconnect       | Partial automated coverage; release gate open |
| C07 | Local IndexedDB write fails/quota exhausted                   | Partial automated coverage; release gate open |
| C08 | Session expires while notes are queued                        | Partial automated coverage; release gate open |
| C09 | Logout with unsynced notes                                    | Open / not verified                           |
| C10 | Apply app/service-worker/schema update with a draft and queue | Partial automated coverage; release gate open |
| C11 | Two tabs sync the same operation                              | Open / not verified                           |
| C12 | Undo races with successful server save                        | Partial automated coverage; release gate open |
| E01 | Note recorded Sept 15 describes yesterday                     | Partial automated coverage; release gate open |
| E02 | Offline note says tomorrow; sync occurs two days later        | Partial automated coverage; release gate open |
| E03 | Note says sometime last week                                  | Open / not verified                           |
| E04 | Note says 3.5 million without currency                        | Open / not verified                           |
| E05 | Common first name matches two people                          | Open / not verified                           |
| E06 | One note describes several interactions                       | Open / not verified                           |
| E07 | AI schema is valid but quote/date/attribution unsupported     | Partial automated coverage; release gate open |
| E08 | User corrects a field while old extraction runs               | Partial automated coverage; release gate open |
| E09 | New event changes an old business position                    | Open / not verified                           |
| E10 | Original note corrected rather than business position changed | Partial automated coverage; release gate open |
| E11 | Planned meeting has no outcome note                           | Open / not verified                           |
| A01 | Question about a commitment                                   | Open / not verified                           |
| A02 | No later completion evidence                                  | Open / not verified                           |
| A03 | Ask why but no stated reason exists                           | Open / not verified                           |
| A04 | Sources conflict                                              | Open / not verified                           |
| A05 | AI invents a source ID/link                                   | Partial automated coverage; release gate open |
| A06 | Hebrew question/English note and reverse                      | Partial automated coverage; release gate open |
| A07 | AI unavailable/budget limit reached                           | Partial automated coverage; release gate open |
| A08 | Note contains malicious instructions                          | Open / not verified                           |
| A09 | Embedding model/dimensions change                             | Open / not verified                           |
| A10 | Old event recorded after a newer event                        | Open / not verified                           |
| R01 | Clear explicit reminder with approved defaults                | Open / not verified                           |
| R02 | Note says maybe we should arrange dinner                      | Open / not verified                           |
| R03 | Date-only due date                                            | Open / not verified                           |
| R04 | Worker crashes/retries or two scheduler calls overlap         | Partial automated coverage; release gate open |
| R05 | User cancels/marks done before delivery                       | Partial automated coverage; release gate open |
| R06 | App closed when reminder becomes due                          | Open / not verified                           |
| R07 | Push service accepts request                                  | Open / not verified                           |
| R08 | Jerusalem daylight-saving change/travel timezone              | Partial automated coverage; release gate open |
| R09 | Birthday has month/day but no birth year                      | Partial automated coverage; release gate open |
| R10 | February 29 birthday and annual preparation                   | Partial automated coverage; release gate open |
| R11 | Import contains old active reminders                          | Partial automated coverage; release gate open |
| P01 | Owner B guesses owner A's IDs                                 | Partial automated coverage; release gate open |
| P02 | Work-only integration queries private data in every endpoint  | Partial automated coverage; release gate open |
| P03 | Note marked No external AI                                    | Partial automated coverage; release gate open |
| P04 | Privacy/scope changes during queued processing                | Partial automated coverage; release gate open |
| P05 | Note deleted                                                  | Partial automated coverage; release gate open |
| P06 | Token revoked/expired                                         | Partial automated coverage; release gate open |
| P07 | Malicious HTML/Markdown/attachment                            | Partial automated coverage; release gate open |
| P08 | Unauthenticated worker endpoint request                       | Partial automated coverage; release gate open |
| X01 | Export complete archive                                       | Partial automated coverage; release gate open |
| X02 | Export then restore into empty isolated dataset               | Partial automated coverage; release gate open |
| X03 | Repeat import/export-part retry                               | Partial automated coverage; release gate open |
| X04 | Malicious ZIP traversal/bomb/foreign-owner references         | Partial automated coverage; release gate open |
| X05 | Copy for AI exceeds budget                                    | Partial automated coverage; release gate open |
| X06 | No-external-AI data in AI-targeted export                     | Partial automated coverage; release gate open |
| X07 | Concurrent commits and paginated change polling               | Open / not verified                           |
| X08 | Allowed note moves into private space                         | Partial automated coverage; release gate open |
| X09 | Folder sync interrupted before cursor commit                  | Partial automated coverage; release gate open |
| X10 | Read-only MCP receives write/delete-like request              | Partial automated coverage; release gate open |
| X11 | Export/restore has missing attachment bytes                   | Partial automated coverage; release gate open |
| U01 | 320px/390px mobile viewport; software keyboard visible        | Partial automated coverage; release gate open |
| U02 | Hebrew/English mixed note with numbers and names              | Partial automated coverage; release gate open |
| U03 | Screen reader and keyboard-only flow                          | Partial automated coverage; release gate open |
| U04 | Real iPhone installation, reopen, dictation, offline, push    | Open / not verified                           |
| O01 | Fresh clone and local setup without AI secrets                | Open / not verified                           |
| O02 | Clean production build, typecheck, lint, tests                | Partial automated coverage; release gate open |
| O03 | Scheduler unavailable or backup destination absent            | Open / not verified                           |
| O04 | Secrets/content scanned in built assets and logs              | Open / not verified                           |
