import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir, writeFile } from "node:fs/promises";
const db = new PGlite();
await db.exec(
  `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql as $$select null::uuid$$;`,
);
for (const file of (await readdir("db/migrations")).sort()) {
  if (file.includes("_storage") || file.includes("_semantic")) continue;
  await db.exec(await readFile(`db/migrations/${file}`, "utf8"));
}
const cols = (
  await db.query<{
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }>(
    `select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' order by table_name,ordinal_position`,
  )
).rows;
const names = [...new Set(cols.map((c) => c.table_name))];
const type = (data: string) =>
  data === "boolean"
    ? "boolean"
    : [
          "integer",
          "bigint",
          "smallint",
          "numeric",
          "real",
          "double precision",
        ].includes(data)
      ? "number"
      : data === "jsonb"
        ? "Json"
        : data === "ARRAY"
          ? "string[]"
          : "string";
let output =
  "// Generated from the applied SQL schema by npm run db:types. Do not edit.\n// Optional pgvector table is verified by the Neon integration test.\nexport type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];\nexport interface DatabaseRows {\n";
for (const name of names) {
  output += `  ${name}: {\n`;
  for (const c of cols.filter((c) => c.table_name === name))
    output += `    ${c.column_name}: ${type(c.data_type)}${c.is_nullable === "YES" ? " | null" : ""};\n`;
  output += "  };\n";
}
output += "}\n";
await writeFile("lib/db/database.types.ts", output);
await db.close();
