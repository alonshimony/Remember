# Operations and recovery

## Health

Settings → Health requires an authenticated owner and reports the AI configuration, queued/dead jobs, worker heartbeat, push configuration and external-backup status. A configured destination is not proof that a restore succeeded. No public health endpoint exposes memories.

## Independent backup

Two different protections are needed: provider database recovery and a portable owner archive containing attachment **bytes**. Neon database backups include the small private file bytes stored in file_objects. Clerk identities live separately; preserve and verify the auth.users mapping when restoring.

Download a full supported archive through Settings → Your data or `npm run archive -- export NEW.zip`. Inspect with `npm run archive -- inspect FILE.zip`; this checks format, paths, expansion limits, hashes and completeness. Keep a private encrypted copy on a separate destination chosen by the owner. Never overwrite the only previous backup. No remote backup service has been connected, and the repository does not silently schedule uploads.

Interactive exports currently refuse accounts exceeding 1,000 rows in any exported table or 3 MB of attachment bytes or a 4 MB ZIP. They do not claim to be complete when gateway row limits truncate data. Larger accounts need the pending multipart implementation. In the meantime an administrator can use PostgreSQL pg_dump/pg_restore with the Neon connection and a verified Clerk identity mapping; that is an operational backup and is not the app's portable ZIP format.

## Restore drill

1. Create an isolated Neon database/branch and apply migrations. Disable Cron, AI and outgoing push.
2. Preserve the same owner auth UUID for same-owner restoration. Cross-owner remapping is not implicit or implemented.
3. Preview the archive. Refuse incompatible record IDs or unknown schemas. Confirm restore only after reviewing counts and scope.
4. Compare canonical text/revision counts, hashes, relationships, policies and actual downloaded attachment hashes. Retry the same archive after a partial attachment-upload failure: the import ledger makes database restoration idempotent.
5. Confirm old reminders are `pending_review`. Do not re-enable them en masse.
6. Record elapsed restore time and destination verification. Do not infer RPO/RTO guarantees from a successful unit test.

The automated restore test creates two independent PostgreSQL engines and checks database fidelity. It does not verify live Clerk UUID mapping, Neon transport or disaster recovery of a real account.

## Failure recovery

- **Unsynced capture:** retain the device, reopen online as the same owner, use Retry sync. Export queued notes before logout if authentication cannot be restored. Never discard the only copy.
- **Idempotency conflict:** retain the editor/local payload and inspect the original operation. Do not silently retry different content under the same ID.
- **Dead processing job:** originals remain saved. Verify provider/model/consent and budget, then use Retry organization. Fix an invalid extraction before replaying it.
- **Expired subscription:** worker disables it on provider 404/410. Re-enable push from the device intentionally.
- **Stale worker:** expired leases can be reclaimed. Apply RPCs reject stale fencing tokens.
- **Interrupted folder sync:** keep the managed manifest and rerun; do not manually advance its cursor.

## Retention and deletion

Trash is excluded from active app retrieval, AI and integrations. Automatic 30-day purge is not yet active. Explicit permanent deletion reauthenticates and removes storage bytes before source rows. Backup retention and previously downloaded copies remain outside the app's immediate control. Configure independent backup retention deliberately rather than representing deletion as instant erasure from every historical copy.
