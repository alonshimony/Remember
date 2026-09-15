import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const db = new PGlite();
await db.exec(
  `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
);
for (const f of [
  "202609150001_core.sql",
  "202609150002_retrieval.sql",
  "202609150003_integrations.sql",
  "202609150005_workers.sql",
  "202609150006_hardening.sql",
])
  await db.exec(await readFile(`db/migrations/${f}`, "utf8"));
const owner = "11111111-1111-4111-8111-111111111111";
await db.exec(
  `insert into invited_owners values('benchmark@example.test');insert into auth.users values('${owner}','benchmark@example.test');insert into captures(id,owner_id,space_id,captured_at,timezone,original_payload_hash) select md5('capture'||g)::uuid,'${owner}',(select id from spaces limit 1),now()-g*interval '1 minute','Asia/Jerusalem',md5(g::text) from generate_series(1,10000) g;insert into revisions(owner_id,capture_id,number,text,content_hash) select owner_id,id,1,'Synthetic benchmark note '||id,md5(id::text) from captures;insert into entities(id,owner_id,space_id,name,kind) select md5('entity'||g)::uuid,'${owner}',(select id from spaces limit 1),'Synthetic topic '||g,'topic' from generate_series(1,10000) g;insert into entity_links(owner_id,space_id,entity_id,capture_id) select '${owner}',(select id from spaces limit 1),md5('entity'||g)::uuid,md5('capture'||g)::uuid from generate_series(1,10000) g;analyze;set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`,
);
const times: number[] = [];
for (let i = 0; i < 30; i++) {
  const start = performance.now();
  const r = await db.query("select * from timeline_page()");
  if (r.rows.length !== 30) throw new Error("Pagination failed");
  times.push(performance.now() - start);
}
times.sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      environment:
        "Node " +
        process.version +
        " / Windows / PGlite (warm in-process SQL, not network or iPhone)",
      synthetic_captures: 10000,
      linked_entities: 10000,
      samples: times.length,
      timeline_page_ms: { p50: times[15], p95: times[28], max: times[29] },
    },
    null,
    2,
  ),
);
await db.close();
