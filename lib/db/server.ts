import { queryClient, type Operation, type Result } from "./query";
import { compile, setReturning } from "./sql";
import { transaction } from "./postgres";
export function serverClient(owner: string | null) {
  async function execute(operation: Operation): Promise<Result> {
    try {
      const compiled = compile(operation, owner === null);
      const result = await transaction(owner, (c) =>
        c.query(compiled.text, compiled.values),
      );
      if (compiled.rpc) {
        const rows = result.rows.map((r) => r.value);
        return {
          data: setReturning.has(operation.rpc!) ? rows : (rows[0] ?? null),
          error: null,
        };
      }
      if (operation.count)
        return {
          data: operation.head ? null : result.rows,
          count: result.rows[0]?.count || 0,
          error: null,
        };
      if (operation.single) {
        if (
          result.rows.length > 1 ||
          (!operation.optional && result.rows.length !== 1)
        )
          throw new Error("Expected one record");
        return { data: result.rows[0] ?? null, error: null };
      }
      return { data: result.rows, error: null };
    } catch (error) {
      return {
        data: null,
        error: {
          message:
            error instanceof Error ? error.message : "Database request failed",
        },
      };
    }
  }
  // Storage is deliberately server-only and always runs under the same RLS owner.
  const storage = {
    from: (bucket: string) => {
      if (bucket !== "attachments" || !owner)
        throw new Error("Storage access rejected");
      return {
        async upload(
          key: string,
          bytes: Uint8Array,
          options: { contentType: string; upsert: boolean },
        ) {
          try {
            await transaction(owner, (c) =>
              c.query(
                `insert into file_objects(storage_key,owner_id,content,mime) values($1,$2,$3,$4) ${options.upsert ? "on conflict(storage_key) do update set content=excluded.content,mime=excluded.mime" : ""}`,
                [key, owner, Buffer.from(bytes), options.contentType],
              ),
            );
            return { error: null };
          } catch {
            return { error: { message: "File upload failed" } };
          }
        },
        async download(key: string) {
          const result = await transaction(owner, (c) =>
            c.query(
              "select content,mime from file_objects where storage_key=$1",
              [key],
            ),
          );
          const row = result.rows[0];
          return {
            data: row
              ? new Blob([new Uint8Array(row.content)], { type: row.mime })
              : null,
            error: row ? null : { message: "File not found" },
          };
        },
        async remove(keys: string[]) {
          try {
            await transaction(owner, (c) =>
              c.query(
                "delete from file_objects where storage_key=any($1::text[])",
                [keys],
              ),
            );
            return { error: null };
          } catch {
            return { error: { message: "File deletion failed" } };
          }
        },
      };
    },
  };
  return { ...queryClient(execute), execute, storage };
}
