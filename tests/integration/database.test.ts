import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, it, expect } from "vitest";
let pg: PGlite;
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222",
  cid = "33333333-3333-4333-8333-333333333333";
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  await pg.exec(
    readFileSync("supabase/migrations/202609150001_core.sql", "utf8"),
  );
  await pg.exec(
    `insert into invited_owners values('synthetic-a@example.test'),('synthetic-b@example.test');insert into auth.users values('${a}','synthetic-a@example.test'),('${b}','synthetic-b@example.test');`,
  );
}, 30000);
afterAll(async () => {
  await pg.close();
});
async function asUser(id: string) {
  await pg.exec(
    `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
it("M0 controlled provisioning rejects uninvited users", async () => {
  await pg.exec("reset role");
  await expect(
    pg.exec(
      `insert into auth.users values(gen_random_uuid(),'uninvited@example.test')`,
    ),
  ).rejects.toThrow("not invited");
});
it("C02 C04 C05 actual SQL transaction is durable and idempotent", async () => {
  await asUser(a);
  const s = await pg.query<{ id: string }>("select id from spaces limit 1");
  const payload = {
    id: cid,
    space_id: s.rows[0].id,
    text: "Synthetic original שלום",
    captured_at: "2026-09-15T09:00:00Z",
    timezone: "Asia/Jerusalem",
    occurred_on: null,
    no_ai: true,
  };
  await pg.query("select save_capture($1::jsonb)", [payload]);
  await pg.query("select save_capture($1::jsonb)", [payload]);
  expect((await pg.query("select * from captures")).rows).toHaveLength(1);
  expect((await pg.query("select * from revisions")).rows).toHaveLength(1);
  await expect(
    pg.query("select save_capture($1::jsonb)", [
      { ...payload, text: "Changed" },
    ]),
  ).rejects.toThrow("conflict");
});
it("P01 actual RLS hides all owner A records from owner B and blocks forged relationships", async () => {
  await asUser(b);
  expect((await pg.query("select * from memory_view")).rows).toHaveLength(0);
  expect((await pg.query("select * from revisions")).rows).toHaveLength(0);
  expect((await pg.query("select * from jobs")).rows).toHaveLength(0);
  await expect(
    pg.query("select mutate_capture($1,1,null,true,null)", [cid]),
  ).rejects.toThrow("Not found");
  const s = await pg.query<{ id: string }>("select id from spaces limit 1");
  await expect(
    pg.query(
      `insert into commitments(owner_id,space_id,capture_id,description,direction) values($1,$2,$3,'forged','i_owe')`,
      [b, s.rows[0].id, cid],
    ),
  ).rejects.toThrow();
  await expect(
    pg.query(
      `insert into revisions(owner_id,capture_id,number,text,content_hash) values($1,$2,2,'forged','hash')`,
      [a, cid],
    ),
  ).rejects.toThrow();
});
it("E08 E10 immutable revisions and optimistic correction", async () => {
  await asUser(a);
  await pg.query("select mutate_capture($1,1,$2,null,null)", [
    cid,
    "Corrected original",
  ]);
  await expect(
    pg.query("select mutate_capture($1,1,$2,null,null)", [
      cid,
      "Stale correction",
    ]),
  ).rejects.toThrow("Revision conflict");
  expect((await pg.query("select * from revisions")).rows).toHaveLength(2);
  await expect(
    pg.exec("update revisions set text='tampered'"),
  ).rejects.toThrow();
});
it("P05 trash immediately leaves active view and writes ordered tombstone", async () => {
  await asUser(a);
  await pg.query("select mutate_capture($1,2,null,true,null)", [cid]);
  expect(
    (await pg.query("select * from memory_view where deleted_at is null")).rows,
  ).toHaveLength(0);
  const rows = (
    await pg.query<{ cursor: number; operation: string }>(
      "select cursor,operation from changes order by cursor",
    )
  ).rows;
  expect(rows.at(-1)?.operation).toBe("delete");
  expect(rows.map((x) => Number(x.cursor))).toEqual([1, 2, 3]);
});
it("P08 browser cannot claim privileged jobs", async () => {
  await asUser(a);
  await expect(pg.exec("select claim_jobs()")).rejects.toThrow(
    "permission denied",
  );
});
