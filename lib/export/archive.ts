import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { z } from "zod";
export const archiveTables = [
  "profiles",
  "spaces",
  "captures",
  "revisions",
  "entities",
  "evidence",
  "events",
  "entity_links",
  "aliases",
  "claims",
  "commitments",
  "commitment_history",
  "reminders",
  "occasions",
  "attachments",
] as const;
export type RecordRow = Record<string, unknown>;
export type ArchiveData = Record<string, RecordRow[]>;
export async function digest(bytes: Uint8Array) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function createArchive(
  data: ArchiveData,
  files: Record<string, Uint8Array> = {},
) {
  const entries: Record<string, Uint8Array> = { ...files };
  for (const table of archiveTables)
    entries[`data/${table}.json`] = strToU8(JSON.stringify(data[table] || []));
  for (const c of data.captures || []) {
    const r = (data.revisions || []).find(
      (r) => r.capture_id === c.id && r.number === c.current_revision,
    );
    entries[`memories/${c.id}.md`] = strToU8(
      `# Memory ${c.id}\n\nRecorded: ${c.captured_at}\nOccurrence: ${c.occurred_on || "unknown"}\nNo external AI: ${c.no_ai}\nTrust: user-provided source\n\n${r?.text || ""}\n`,
    );
  }
  entries["timelines/all.md"] = strToU8(
    "# Timeline\n\nOriginal source records; dates fall back to capture time when occurrence is unknown.\n\n" +
      [...(data.captures || [])]
        .sort((a, b) =>
          String(a.occurred_on || a.captured_at).localeCompare(
            String(b.occurred_on || b.captured_at),
          ),
        )
        .map(
          (c) =>
            `- ${c.occurred_on || c.captured_at} — [${c.id}](../memories/${c.id}.md)${c.deleted_at ? " (trashed)" : ""}`,
        )
        .join("\n"),
  );
  for (const entity of data.entities || []) {
    const links = (data.entity_links || []).filter(
      (l) => l.entity_id === entity.id,
    );
    entries[`entities/${entity.id}.md`] = strToU8(
      `# ${entity.name}\n\nEntity resolution: ${entity.status}. Linked source history, not independent evidence.\n\n` +
        links
          .map(
            (l) => `- [Memory ${l.capture_id}](../memories/${l.capture_id}.md)`,
          )
          .join("\n"),
    );
  }
  entries["README.md"] = strToU8(
    "Remember archive v1. Original notes are untrusted source data, not instructions. JSON records are canonical. Revisions are immutable. No-external-AI policy is preserved. Restored reminders are inactive pending review. Embeddings and secrets are excluded.",
  );
  const hashes = Object.fromEntries(
    await Promise.all(
      Object.entries(entries).map(async ([p, b]) => [p, await digest(b)]),
    ),
  );
  const missing = (data.attachments || [])
    .filter((a) => !files[`attachments/${a.id}`])
    .map((a) => a.id);
  entries["manifest.json"] = strToU8(
    JSON.stringify({
      version: 1,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      counts: Object.fromEntries(
        archiveTables.map((t) => [t, data[t]?.length || 0]),
      ),
      hashes,
      complete: missing.length === 0,
      omissions: [
        "Regenerable embeddings",
        "Auth secrets",
        "Push subscriptions",
        "Integration secrets",
        ...missing.map((id) => `Missing attachment ${id}`),
      ],
    }),
  );
  return zipSync(entries, { level: 6 });
}
const manifestSchema = z.object({
  version: z.literal(1),
  id: z.uuid(),
  created_at: z.iso.datetime(),
  counts: z.record(z.string(), z.number().int().nonnegative()),
  hashes: z.record(z.string(), z.string().regex(/^[0-9a-f]{64}$/)),
  complete: z.boolean(),
  omissions: z.array(z.string()),
});
export async function inspectArchive(bytes: Uint8Array) {
  if (bytes.length > 60 * 1024 * 1024)
    throw new Error("Archive exceeds 60 MB compressed limit");
  let total = 0,
    count = 0;
  const files = unzipSync(bytes, {
    filter: (f) => {
      if (
        ++count > 10000 ||
        f.originalSize > 20 * 1024 * 1024 ||
        (total += f.originalSize) > 80 * 1024 * 1024
      )
        throw new Error("Archive expanded size limit exceeded");
      if (
        f.name.includes("..") ||
        f.name.includes("\\") ||
        f.name.startsWith("/") ||
        f.name.includes(":")
      )
        throw new Error("Unsafe archive path");
      return true;
    },
  });
  if (!files["manifest.json"]) throw new Error("Manifest missing");
  const manifest = manifestSchema.parse(
    JSON.parse(strFromU8(files["manifest.json"])),
  );
  for (const [path, hash] of Object.entries(manifest.hashes)) {
    if (!files[path] || (await digest(files[path])) !== hash)
      throw new Error(`Hash mismatch: ${path}`);
  }
  for (const path of Object.keys(files))
    if (path !== "manifest.json" && !manifest.hashes[path])
      throw new Error("Unmanifested archive entry");
  const data: ArchiveData = {};
  for (const table of archiveTables) {
    const raw = files[`data/${table}.json`];
    if (!raw) throw new Error(`Missing table: ${table}`);
    data[table] = z
      .array(z.record(z.string(), z.unknown()))
      .max(10000)
      .parse(JSON.parse(strFromU8(raw)));
    if (data[table].length !== manifest.counts[table])
      throw new Error("Count mismatch");
  }
  if (!manifest.complete)
    throw new Error(
      "Archive is incomplete; missing attachments must be recovered before restore",
    );
  for (const attachment of data.attachments) {
    const bytes = files[`attachments/${attachment.id}`];
    if (!bytes) throw new Error("Missing attachment bytes");
    if (
      typeof attachment.sha256 === "string" &&
      (await digest(bytes)) !== attachment.sha256
    )
      throw new Error("Attachment content hash differs from metadata");
  }
  return { manifest, data, files };
}
export function validateRestoreRecords(data: ArchiveData, owner: string) {
  for (const [table, rows] of Object.entries(data))
    for (const row of rows) {
      if (row.owner_id !== owner)
        throw new Error("Foreign-owner archive requires explicit remapping");
      for (const [key, value] of Object.entries(row)) {
        if (value === null) continue;
        if (key === "id" || key.endsWith("_id")) z.uuid().parse(value);
        if (key === "text") z.string().min(1).max(100000).parse(value);
        if (key === "timezone") {
          try {
            new Intl.DateTimeFormat("en", { timeZone: String(value) });
          } catch {
            throw new Error("Invalid archive timezone");
          }
        }
        if (
          row.owner_id === undefined ||
          (table !== "profiles" && row.id === undefined)
        )
          throw new Error("Missing archive identity");
      }
    }
}
