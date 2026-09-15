import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { LocalStore, syncQueue } from "../../lib/offline/store";
import { vi } from "vitest";
const payload = {
  id: "11111111-1111-4111-8111-111111111111",
  space_id: "22222222-2222-4222-8222-222222222222",
  text: "Synthetic note שלום",
  captured_at: "2026-09-15T09:00:00Z",
  timezone: "Asia/Jerusalem",
  no_ai: true,
  occurred_on: null,
};
it("C07 failed local transaction keeps the durable draft and creates no queued note", async () => {
  const db = new LocalStore(crypto.randomUUID(), "test");
  await db.draft(payload.text);
  const add = vi
    .spyOn(db.operations, "add")
    .mockRejectedValue(new Error("Quota exceeded"));
  await expect(db.save(payload)).rejects.toThrow("Quota");
  expect((await db.drafts.get("capture"))?.text).toBe(payload.text);
  expect(await db.operations.count()).toBe(0);
  add.mockRestore();
  await db.delete();
});
it("C06 durable local transaction survives reopen; C08 wrong owner cannot upload", async () => {
  const db = new LocalStore(crypto.randomUUID(), "test");
  await db.draft(payload.text);
  await db.save(payload);
  db.close();
  await db.open();
  expect((await db.operations.get(payload.id))?.payload.text).toBe(
    payload.text,
  );
  expect(await db.drafts.count()).toBe(0);
  await expect(
    syncQueue(db, "a", {
      owner: async () => "b",
      save: async () => {},
      remove: async () => {},
    }),
  ).rejects.toThrow("same owner");
  await db.delete();
});
it("C03 C05 local retries preserve canonical operation", async () => {
  const db = new LocalStore(crypto.randomUUID(), "test");
  await db.save(payload);
  await db.save(payload);
  expect(await db.operations.count()).toBe(1);
  await expect(db.save({ ...payload, text: "Changed" })).rejects.toThrow(
    "conflict",
  );
  await db.delete();
});
it("C12 undo racing save is honored after acknowledgement", async () => {
  const db = new LocalStore(crypto.randomUUID(), "test");
  await db.save(payload);
  let removed = false;
  await syncQueue(db, db.owner, {
    owner: async () => db.owner,
    save: async () => {
      await db.operations.update(payload.id, { state: "undo" });
    },
    remove: async () => {
      removed = true;
    },
  });
  expect(removed).toBe(true);
  expect(await db.operations.count()).toBe(0);
  await db.delete();
});
