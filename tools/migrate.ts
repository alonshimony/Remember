import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Pool } from "pg";
const url = process.env.DATABASE_URL;
if (!url) {
  if (process.argv.includes("--if-configured") && !process.env.VERCEL) {
    console.log("DATABASE_URL is unset; building the setup screen.");
    process.exit(0);
  }
  throw new Error(
    "Set DATABASE_URL to the Neon connection string before deployment.",
  );
}
if (
  process.env.VERCEL &&
  (!process.env.CLERK_SECRET_KEY ||
    !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)
)
  throw new Error("Set both Clerk keys in Vercel before deploying.");
const pool = new Pool({
  connectionString: url,
  max: 1,
  connectionTimeoutMillis: 15000,
});
const client = await pool.connect();
try {
  await client.query("begin");
  await client.query("set local lock_timeout = '60s'");
  await client.query("select pg_advisory_xact_lock(726364829)");
  await client.query(await readFile("db/bootstrap.sql", "utf8"));
  const migrations = (await readdir("db/migrations"))
    .filter((f) => f.endsWith(".sql") && !f.includes("_storage"))
    .sort();
  for (const file of [...migrations, "neon_files_v1.sql"]) {
    const sql = await readFile(
      file === "neon_files_v1.sql" ? "db/files.sql" : `db/migrations/${file}`,
      "utf8",
    );
    const checksum = createHash("sha256")
      .update(sql.replace(/\r\n/g, "\n"))
      .digest("hex");
    const prior = await client.query(
      "select checksum from remember_migrations where name=$1",
      [file],
    );
    if (prior.rows.length) {
      if (prior.rows[0].checksum !== checksum)
        throw new Error(`Migration changed after application: ${file}`);
      continue;
    }
    await client.query(sql);
    await client.query(
      "insert into remember_migrations(name,checksum) values($1,$2)",
      [file, checksum],
    );
    console.log(`Applied ${file}`);
  }
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Set OWNER_EMAIL to the email you will verify in Clerk.");
  await client.query(
    "insert into invited_owners(email) values($1) on conflict do nothing",
    [email],
  );
  await client.query("commit");
  console.log(
    "Neon schema ready. The invited owner workspace is created on first Clerk sign-in.",
  );
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
  await pool.end();
}
