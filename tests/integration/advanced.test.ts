import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, it, expect } from "vitest";
let pg: PGlite;
const owner = "11111111-1111-4111-8111-111111111111";
let work: string, privateSpace: string;
const workId = crypto.randomUUID(),
  privateId = crypto.randomUUID();
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  for (const f of [
    "202609150001_core.sql",
    "202609150002_retrieval.sql",
    "202609150003_integrations.sql",
    "202609150005_workers.sql",
    "202609150006_hardening.sql",
    "202609150008_reminder_guards.sql",
    "202609150009_lifecycle.sql",
    "202609150010_purge_authorization.sql",
    "202609150011_archive_snapshot.sql",
  ])
    await pg.exec(readFileSync(`db/migrations/${f}`, "utf8"));
  await pg.exec(
    `insert into invited_owners values('synthetic@example.test');insert into auth.users values('${owner}','synthetic@example.test');set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`,
  );
  const s = (
    await pg.query<{ id: string; name: string }>("select * from spaces")
  ).rows;
  work = s.find((x) => x.name === "Work")!.id;
  privateSpace = s.find((x) => x.name === "Private Inbox")!.id;
  for (const [id, space_id, text, no_ai] of [
    [workId, work, "Synthetic Work Maya", false],
    [privateId, privateSpace, "Synthetic Private Maya", false],
  ])
    await pg.query("select save_capture($1::jsonb)", [
      {
        id,
        space_id,
        text,
        no_ai,
        captured_at: "2026-09-15T09:00:00Z",
        timezone: "Asia/Jerusalem",
        occurred_on: null,
      },
    ]);
  await pg.query(
    `select issue_integration('test-hash','rm_test',$1,array['memories','timeline','search','context','changes','entities','events','commitments'],now()+interval '1 day')`,
    [[work]],
  );
}, 30000);
afterAll(async () => {
  await pg.close();
});
it('X01 snapshot includes owner profile and immutable originals in one bounded SQL call',async()=>{await pg.exec('reset role;set role authenticated');const result=await pg.query<{archive_snapshot:{profiles:{owner_id:string}[];captures:{id:string}[];revisions:unknown[]}}>('select archive_snapshot()');expect(result.rows[0].archive_snapshot.profiles[0].owner_id).toBe(owner);expect(result.rows[0].archive_snapshot.captures.some(c=>c.id===workId)).toBe(true);expect(result.rows[0].archive_snapshot.revisions.length).toBeGreaterThan(0);});
it("R09 R10 approved annual preparation is idempotent with independent future-year tasks", async () => {
  await pg.exec("reset role;set role authenticated");
  const id = crypto.randomUUID(),
    year = new Date().getUTCFullYear() + 1;
  await pg.query(
    `insert into occasions(id,owner_id,space_id,name,month,day,leap_policy) values($1,$2,$3,'Synthetic birthday',2,29,'mar1')`,
    [id, owner, work],
  );
  await expect(
    pg.query("select schedule_birthday($1,$2,$3)", [id, year, [30, 7, 1]]),
  ).rejects.toThrow("Approve reminder defaults");
  await pg.query(
    "update profiles set reminder_defaults_approved=true where owner_id=$1",
    [owner],
  );
  const first = await pg.query<{ schedule_birthday: string }>(
    "select schedule_birthday($1,$2,$3)",
    [id, year, [30, 7, 1]],
  );
  const again = await pg.query<{ schedule_birthday: string }>(
    "select schedule_birthday($1,$2,$3)",
    [id, year, [30, 7, 1]],
  );
  expect(again.rows[0]).toEqual(first.rows[0]);
  const tasks = await pg.query(
    "select * from commitments where capture_id=$1",
    [first.rows[0].schedule_birthday],
  );
  expect(tasks.rows).toHaveLength(3);
  await pg.query("select schedule_birthday($1,$2,$3)", [
    id,
    year + 1,
    [30, 7, 1],
  ]);
  expect((await pg.query("select * from commitments")).rows).toHaveLength(6);
});
it("P02 every integration endpoint uses space restrictions in SQL", async () => {
  await pg.exec("reset role;set role service_role");
  for (const endpoint of [
    "memories",
    "timeline",
    "search",
    "context",
    "entities",
    "events",
    "commitments",
  ]) {
    const result = await pg.query<{ integration_read: { data: unknown[] } }>(
      "select integration_read($1,$2,null,$3,0,30)",
      ["test-hash", endpoint, "Maya"],
    );
    expect(JSON.stringify(result.rows)).not.toContain("Synthetic Private");
  }
  const result = await pg.query<{ integration_read: { data: unknown[] } }>(
    "select integration_read($1,$2,$3,'',0,30)",
    ["test-hash", "memories", privateId],
  );
  expect(result.rows[0].integration_read.data).toHaveLength(0);
});
it("P03 A07 no-AI sources cannot enter AI retrieval", async () => {
  await pg.exec("reset role;set role authenticated");
  expect(
    (await pg.query("select * from search_memories($1,true,20)", [["Maya"]]))
      .rows,
  ).toHaveLength(0);
  expect(
    (await pg.query("select * from search_memories($1,false,20)", [["Maya"]]))
      .rows,
  ).toHaveLength(2);
});
it("P04 X08 privacy change emits revocation without private bodies", async () => {
  await pg.query("select mutate_capture($1,1,null,null,true)", [workId]);
  await pg.exec("reset role;set role service_role");
  const result = await pg.query<{
    integration_read: {
      data: { id: string; operation: string; memory: unknown }[];
    };
  }>("select integration_read('test-hash','changes',null,'',0,30)");
  const data = result.rows[0].integration_read.data;
  expect(data.length).toBeGreaterThan(0);
  expect(
    data.every(
      (x) => x.id === workId && x.operation === "delete" && x.memory === null,
    ),
  ).toBe(true);
});
it("P06 revocation rejects all subsequent calls immediately", async () => {
  await pg.exec("reset role;set role authenticated");
  await pg.exec("select revoke_integration(id) from integration_tokens");
  await pg.exec("reset role;set role service_role");
  await expect(
    pg.exec("select integration_read('test-hash','memories')"),
  ).rejects.toThrow("Invalid integration token");
});
it("R04 extraction leases are exclusive, stale fences cannot apply", async () => {
  const first = (
    await pg.query<{ id: string; fence: string }>("select * from claim_jobs(1)")
  ).rows;
  expect(first).toHaveLength(1);
  const second = (await pg.query<{ id: string }>("select * from claim_jobs(1)"))
    .rows;
  expect(second.some((x) => x.id === first[0].id)).toBe(false);
  const result = await pg.query<{ finish_extraction: boolean }>(
    "select finish_extraction($1,$2,$3)",
    [first[0].id, crypto.randomUUID(), {}],
  );
  expect(result.rows[0].finish_extraction).toBe(false);
});
it("R04 R05 delivery ledger deduplicates and cancelled reminder cannot be claimed", async () => {
  await pg.exec("reset role;set role authenticated");
  const r = crypto.randomUUID();
  await pg.query(
    `insert into reminders(id,owner_id,capture_id,run_at,timezone) values($1,$2,$3,now()-interval '1 minute','Asia/Jerusalem')`,
    [r, owner, workId],
  );
  await pg.query(
    `insert into push_subscriptions(owner_id,subscription) values($1,'{"endpoint":"https://web.push.apple.com/synthetic"}')`,
    [owner],
  );
  await pg.exec("reset role;set role service_role");
  expect(
    (await pg.query("select * from claim_deliveries()")).rows,
  ).toHaveLength(1);
  expect(
    (await pg.query("select * from claim_deliveries()")).rows,
  ).toHaveLength(0);
  expect((await pg.query("select * from deliveries")).rows).toHaveLength(1);
  await pg.exec("reset role;set role authenticated");
  await pg.query("update reminders set status='cancelled' where id=$1", [r]);
  await pg.exec("reset role;set role service_role");
  expect(
    (await pg.query("select * from claim_deliveries()")).rows,
  ).toHaveLength(0);
});
