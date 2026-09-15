import { readFile, writeFile } from "node:fs/promises";
import { inspectArchive } from "../lib/export/archive";
const args = process.argv.slice(2);
const file = args[1];
if (args[0] === "inspect" && file) {
  const result = await inspectArchive(new Uint8Array(await readFile(file)));
  console.log(JSON.stringify(result.manifest, null, 2));
} else if (args[0] === "export" && file) {
  const url = process.env.REMEMBER_URL,
    token = process.env.REMEMBER_OWNER_ACCESS_TOKEN;
  if (!url || !token)
    throw new Error(
      "Set REMEMBER_URL and a short-lived REMEMBER_OWNER_ACCESS_TOKEN; integration tokens cannot export private backups",
    );
  const response = await fetch(new URL("/api/archive", url), {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok)
    throw new Error(`Archive rejected (${response.status}); no backup written`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  await inspectArchive(bytes);
  await writeFile(file, bytes, { flag: "wx" });
  console.log("Complete archive written and checksums validated.");
} else
  throw new Error(
    "Usage: npm run archive -- inspect FILE.zip | export NEW-FILE.zip",
  );
