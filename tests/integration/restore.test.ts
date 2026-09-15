import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
import { archiveTables, type ArchiveData } from "../../lib/export/archive";
const owner = "11111111-1111-4111-8111-111111111111";
async function database() {
  const pg = new PGlite();
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
  ])
    await pg.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
  await pg.exec(
    `insert into invited_owners values('synthetic@example.test');insert into auth.users values('${owner}','synthetic@example.test');set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`,
  );
  return pg;
}
it("X02 X03 R11 actual database round-trip preserves revisions, relationships, policy and disables reminders", async () => {
  const source = await database(),
    target = await database();
  try {
    const sid = (
      await source.query<{ id: string }>("select id from spaces limit 1")
    ).rows[0].id;
    const id = crypto.randomUUID();
    await source.query("select save_capture($1)", [
      {
        id,
        space_id: sid,
        text: "שלום Synthetic original",
        no_ai: true,
        captured_at: "2026-09-15T09:00:00Z",
        timezone: "Asia/Jerusalem",
        occurred_on: null,
      },
    ]);
    await source.query("select mutate_capture($1,1,$2)", [
      id,
      "Synthetic corrected שלום",
    ]);
    await source.query(
      `insert into commitments(owner_id,space_id,capture_id,description,direction,status) values($1,$2,$3,'Synthetic promise','i_owe','open')`,
      [owner, sid, id],
    );
    await source.query(
      `insert into reminders(owner_id,capture_id,run_at,timezone) values($1,$2,now()+interval '1 day','Asia/Jerusalem')`,
      [owner, id],
    );
    const data: ArchiveData = {};
    for (const t of archiveTables)
      data[t] = (
        await source.query<Record<string, unknown>>(`select * from ${t}`)
      ).rows;
    const archive = crypto.randomUUID();
    await target.query("select restore_archive($1,$2)", [archive, data]);
    await target.query("select restore_archive($1,$2)", [archive, data]);
    for (const t of archiveTables)
      expect((await target.query(`select * from ${t}`)).rows.length).toBe(
        data[t].length,
      );
    expect(
      (await target.query<{ status: string }>("select status from reminders"))
        .rows[0].status,
    ).toBe("pending_review");
    expect(
      (await target.query<{ text: string }>("select text from memory_view"))
        .rows[0].text,
    ).toBe("Synthetic corrected שלום");
    expect(
      (await target.query<{ no_ai: boolean }>("select no_ai from captures"))
        .rows[0].no_ai,
    ).toBe(true);
  } finally {
    await source.close();
    await target.close();
  }
});
