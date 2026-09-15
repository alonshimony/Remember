import Dexie, { type EntityTable } from "dexie";
import type { CaptureInput } from "../domain/schema";
import type { Memory } from "../domain/schema";
export type Operation = {
  id: string;
  payload: CaptureInput;
  state: "queued" | "synced" | "undo";
  attempts: number;
  nextAttempt: number;
  error?: string;
};
export class LocalStore extends Dexie {
  memories!: EntityTable<Memory, "id">;
  operations!: EntityTable<Operation, "id">;
  drafts!: EntityTable<{ id: string; text: string; updatedAt: string }, "id">;
  constructor(
    public readonly owner: string,
    environment: string,
  ) {
    super(`remember:${environment}:${owner}`);
    this.version(1).stores({
      operations: "id,state,nextAttempt",
      drafts: "id",
    });
    this.version(2).stores({
      operations: "id,state,nextAttempt",
      drafts: "id",
      memories: "id,captured_at",
    });
  }
  async save(payload: CaptureInput) {
    await this.transaction("rw", this.operations, this.drafts, async () => {
      const existing = await this.operations.get(payload.id);
      if (
        existing &&
        JSON.stringify(existing.payload) !== JSON.stringify(payload)
      )
        throw new Error("Local idempotency conflict");
      if (!existing)
        await this.operations.add({
          id: payload.id,
          payload,
          state: "queued",
          attempts: 0,
          nextAttempt: 0,
        });
      await this.drafts.delete("capture");
    });
  }
  async draft(text: string) {
    await this.drafts.put({
      id: "capture",
      text,
      updatedAt: new Date().toISOString(),
    });
  }
}
export async function syncQueue(
  store: LocalStore,
  owner: string,
  transport: {
    owner: () => Promise<string | null>;
    save: (p: CaptureInput) => Promise<void>;
    remove: (p: CaptureInput) => Promise<void>;
  },
  force = false,
) {
  if (store.owner !== owner || (await transport.owner()) !== owner)
    throw new Error("Sign in as the same owner to sync this device");
  const rows = await store.operations
    .where("state")
    .anyOf("queued", "undo")
    .toArray();
  for (const row of rows) {
    if (!force && row.nextAttempt > Date.now()) continue;
    try {
      if ((await transport.owner()) !== owner)
        throw new Error("Session owner changed");
      // A queued undo also creates the idempotent original first: a lost acknowledgement cannot leave a ghost.
      await transport.save(row.payload);
      const current = await store.operations.get(row.id);
      if (current?.state === "undo") {
        await transport.remove(row.payload);
        await store.operations.delete(row.id);
      } else
        await store.operations.update(row.id, {
          state: "synced",
          error: undefined,
        });
    } catch (error) {
      await store.operations.update(row.id, {
        attempts: row.attempts + 1,
        nextAttempt: Date.now() + Math.min(60000, 1000 * 2 ** row.attempts),
        error: error instanceof Error ? error.message : "Sync failed",
      });
    }
  }
}
