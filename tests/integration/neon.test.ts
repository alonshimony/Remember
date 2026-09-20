import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, expect, it } from "vitest";
import { compile } from "../../lib/db/sql";
import type { Operation } from "../../lib/db/query";
let pg: PGlite;
const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const capture = "33333333-3333-4333-8333-333333333333";
let space: string;
beforeAll(async () => {
  pg = new PGlite({ extensions: { vector } });
  await pg.exec(readFileSync("db/bootstrap.sql", "utf8"));
  for (const name of readdirSync("db/migrations")
    .sort()
    .filter((n) => n.endsWith(".sql") && !n.includes("_storage")))
    await pg.exec(readFileSync(`db/migrations/${name}`, "utf8"));
  await pg.exec(readFileSync("db/files.sql", "utf8"));
  await pg.query("insert into invited_owners(email) values($1),($2)", [
    "a@example.test",
    "b@example.test",
  ]);
  await pg.query(
    "insert into auth.users(id,email,clerk_id) values($1,$2,$3),($4,$5,$6)",
    [a, "a@example.test", "user_a", b, "b@example.test", "user_b"],
  );
  space = (
    await pg.query<{ id: string }>(
      "select id from spaces where owner_id=$1 limit 1",
      [a],
    )
  ).rows[0].id;
}, 30000);
afterAll(async () => {
  await pg.close();
});
async function run(owner: string, op: Operation) {
  const query = compile(op);
  return pg.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
      owner,
    ]);
    return tx.query(query.text, query.values);
  });
}
it("runs the entire Neon schema including pgvector, maps Clerk IDs and creates isolated workspaces", async () => {
  const result = await run(a, {
    rpc: "save_capture",
    args: {
      payload: {
        id: capture,
        space_id: space,
        text: "Neon migration fixture",
        captured_at: new Date().toISOString(),
        timezone: "UTC",
        no_ai: true,
      },
    },
  });
  expect(result.rows).toEqual([{ value: capture }]);
  expect((await run(a, { rpc: "timeline_page" })).rows).toHaveLength(1);
  expect((await run(b, { rpc: "timeline_page" })).rows).toEqual([]);
  expect((await run(a, { table: "spaces" })).rows).toHaveLength(3);
  expect((await pg.query("select * from auth.users")).rows).toHaveLength(2);
});
it("keeps owner context local to the transaction and SQL grants reject direct revision writes", async () => {
  expect(
    (await pg.query<{ role: string }>("select current_user as role")).rows[0]
      .role,
  ).not.toBe("authenticated");
  await expect(
    run(b, {
      rpc: "mutate_capture",
      args: { cid: capture, expected: 1, new_text: "forged" },
    }),
  ).rejects.toThrow();
  await expect(
    run(a, {
      table: "revisions",
      action: "update",
      values: { text: "forged" },
      filters: [{ column: "capture_id", op: "eq", value: capture }],
    }),
  ).rejects.toThrow();
  expect(
    (
      await run(a, {
        table: "memory_view",
        filters: [{ column: "id", op: "eq", value: capture }],
      })
    ).rows,
  ).toHaveLength(1);
});
it("parameterizes hostile values and rejects SQL identifiers and privileged functions from clients", async () => {
  const hostile = "x'); drop table captures;--";
  const compiled = compile({
    table: "profiles",
    action: "update",
    values: { display_name: hostile },
    filters: [{ column: "owner_id", op: "eq", value: a }],
  });
  expect(compiled.text).not.toContain(hostile);
  expect(
    (
      await run(a, {
        table: "profiles",
        action: "update",
        values: { display_name: hostile },
        filters: [{ column: "owner_id", op: "eq", value: a }],
      })
    ).rows,
  ).toHaveLength(1);
  for (const op of [
    { table: "auth.users" },
    { rpc: "purge_capture_verified" },
    { table: "spaces", columns: "id,(select current_user)" },
    { table: "spaces", order: { column: "id;reset role", ascending: true } },
  ])
    expect(() => compile(op)).toThrow();
  expect(
    (
      await run(a, {
        table: "captures",
        filters: [{ column: "id", op: "in", value: [] }],
      })
    ).rows,
  ).toEqual([]);
});
it("enforces RLS for private file bytes and cascades bytes when metadata is removed", async () => {
  const fileId = crypto.randomUUID();
  const key = `${a}/${capture}/${fileId}`;
  await run(a, {
    table: "attachments",
    action: "insert",
    values: {
      id: fileId,
      owner_id: a,
      space_id: space,
      capture_id: capture,
      storage_key: key,
      name: "note.txt",
      mime: "text/plain",
      size: 5,
      sha256: "test",
    },
  });
  await pg.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [a]);
    await tx.query(
      "insert into file_objects(storage_key,owner_id,content,mime) values($1,$2,$3,$4)",
      [key, a, new TextEncoder().encode("hello"), "text/plain"],
    );
  });
  await pg.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [b]);
    expect((await tx.query("select * from file_objects")).rows).toEqual([]);
    expect(
      (
        await tx.query(
          "delete from file_objects where storage_key=$1 returning *",
          [key],
        )
      ).rows,
    ).toEqual([]);
  });
  await run(a, {
    table: "attachments",
    action: "delete",
    filters: [{ column: "id", op: "eq", value: fileId }],
  });
  expect((await pg.query("select * from file_objects")).rows).toEqual([]);
});
it("does not allow authenticated roles to add invitations or read identity mappings", async () => {
  await expect(
    pg.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query("select * from auth.users");
    }),
  ).rejects.toThrow();
  await expect(
    pg.query("insert into auth.users(email,clerk_id) values($1,$2)", [
      "stranger@example.test",
      "user_stranger",
    ]),
  ).rejects.toThrow("not invited");
});

async function temporalFixture(
  text: string,
  days: number,
  options: { noAI?: boolean; occurredOn?: string } = {},
) {
  const id = crypto.randomUUID();
  await run(a, {
    rpc: "save_capture",
    args: {
      payload: {
        id,
        space_id: space,
        text,
        captured_at: new Date(Date.now() - days * 86400000).toISOString(),
        timezone: "UTC",
        occurred_on: options.occurredOn || null,
        no_ai: options.noAI || false,
      },
    },
  });
  return id;
}
async function taskFixture(
  id: string,
  description: string,
  status: string,
  due: string | null = null,
) {
  const result = await pg.query<{ id: string }>(
    "insert into commitments(owner_id,space_id,capture_id,description,direction,status,due_on) values($1,$2,$3,$4,$5,$6,$7) returning id",
    [a, space, id, description, "i_owe", status, due],
  );
  const taskId = result.rows[0].id;
  await pg.query(
    "update commitment_history set created_at=now()-interval '14 days' where commitment_id=$1",
    [taskId],
  );
  return taskId;
}
async function currentRows(owner = a, aiOnly = false) {
  return (
    await run(owner, { rpc: "current_task_sources", args: { ai_only: aiOnly } })
  ).rows as {
    value: { id: string; action_evidence: { id: string; quote: string }[] };
  }[];
}
it("does not turn two-week-old milk into a current task; retains searchable history and recent notes", async () => {
  const stale = await temporalFixture("I have to buy some milk", 14);
  const recent = await temporalFixture("I have to buy some bread", 1);
  const backdated = await temporalFixture("Historical: buy some coffee", 0, {
    occurredOn: "2020-01-01",
  });
  const rows = await currentRows();
  expect(rows.some((r) => r.value.id === stale)).toBe(false);
  expect(rows.some((r) => r.value.id === backdated)).toBe(false);
  expect(rows.some((r) => r.value.id === recent)).toBe(true);
  expect(
    (await run(a, { rpc: "search_memories", args: { query_terms: ["milk"] } }))
      .rows,
  ).toHaveLength(1);
  expect(await currentRows(b)).toEqual([]);
});
it("keeps confirmed future tasks, excludes done/cancelled/past-due tasks and revives an explicit reconfirmation", async () => {
  const future = (
    await pg.query<{ day: string }>("select (current_date+30)::text as day")
  ).rows[0].day;
  const yesterday = (
    await pg.query<{ day: string }>("select (current_date-1)::text as day")
  ).rows[0].day;
  const note = await temporalFixture(
    "Buy milk. Renew my passport. Call the bank.",
    14,
  );
  await taskFixture(note, "Buy milk.", "done");
  const passport = await taskFixture(
    note,
    "Renew my passport.",
    "open",
    future,
  );
  const phone = await taskFixture(note, "Call the bank.", "open");
  let evidence = (await currentRows()).find((r) => r.value.id === note)!.value
    .action_evidence;
  expect(evidence.map((e) => e.id)).toEqual([passport]);
  await run(a, {
    table: "commitments",
    action: "update",
    values: { status: "open" },
    filters: [{ column: "id", op: "eq", value: phone }],
  });
  evidence = (await currentRows()).find((r) => r.value.id === note)!.value
    .action_evidence;
  expect(evidence.map((e) => e.id)).toContain(phone);
  for (const status of ["done", "cancelled", "open"]) {
    const id = await temporalFixture(`Task ${status}`, 0);
    await taskFixture(
      id,
      `Task ${status}`,
      status,
      status === "open" ? yesterday : null,
    );
    expect((await currentRows()).some((r) => r.value.id === id)).toBe(false);
  }
});
it("does not refresh an old intention when background extraction happens later; honors AI privacy", async () => {
  const old = await temporalFixture("Buy old proposed milk", 14);
  const lateTask = await taskFixture(old, "Buy old proposed milk", "proposed");
  await pg.query(
    "update commitment_history set created_at=now() where commitment_id=$1",
    [lateTask],
  );
  expect((await currentRows()).some((r) => r.value.id === old)).toBe(false);
  const privateId = await temporalFixture("Private task", 0, { noAI: true });
  await pg.query("update profiles set ai_consent=true where owner_id=$1", [a]);
  expect((await currentRows()).some((r) => r.value.id === privateId)).toBe(
    true,
  );
  expect(
    (await currentRows(a, true)).some((r) => r.value.id === privateId),
  ).toBe(false);
});
