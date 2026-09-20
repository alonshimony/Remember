import type { Operation } from "./query";
const tables = new Set(
  "profiles spaces captures memory_view revisions attachments events entities entity_links commitments reminders occasions integration_tokens push_subscriptions jobs worker_health".split(
    " ",
  ),
);
const ownerRpcs = new Set(
  "save_capture mutate_capture timeline_page search_memories current_task_sources semantic_memories consume_ai_budget move_capture retry_processing review_event schedule_birthday revoke_integration issue_integration archive_snapshot restore_archive".split(
    " ",
  ),
);
const adminRpcs = new Set(
  "integration_read purge_capture_verified materialize_birthdays claim_jobs worker_ai_budget store_embedding finish_extraction claim_deliveries finish_delivery".split(
    " ",
  ),
);
export function identifier(value: string) {
  if (typeof value !== "string" || !/^[a-z_][a-z0-9_]*$/.test(value))
    throw new Error("Invalid identifier");
  return `"${value}"`;
}
export function compile(operation: Operation, privileged = false) {
  const values: unknown[] = [];
  const parameter = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (operation.rpc) {
    if (
      !ownerRpcs.has(operation.rpc) &&
      !(privileged && adminRpcs.has(operation.rpc))
    )
      throw new Error("Function not allowed");
    const args = Object.entries(operation.args || {}).map(
      ([key, value]) =>
        `${identifier(key)} => ${parameter(Array.isArray(value) && ["query_embedding", "value"].includes(key) ? JSON.stringify(value) : value)}`,
    );
    // Convert each result to JSON so set-returning and scalar functions retain their SQL shape.
    return {
      text: `select to_jsonb(result) as value from public.${identifier(operation.rpc)}(${args.join(",")}) result`,
      values,
      rpc: true,
    };
  }
  if (!operation.table || !tables.has(operation.table))
    throw new Error("Table not allowed");
  const table = `public.${identifier(operation.table)}`;
  const columns =
    !operation.columns || operation.columns === "*"
      ? "*"
      : operation.columns.split(",").map(identifier).join(",");
  const filters = (operation.filters || []).map((f) => {
    const column = identifier(f.column);
    if (f.op === "eq") return `${column} = ${parameter(f.value)}`;
    if (f.op === "is" && f.value === null) return `${column} is null`;
    if (f.op === "not-null" && f.value === null) return `${column} is not null`;
    if (f.op === "in" && Array.isArray(f.value) && f.value.length <= 1000)
      return f.value.length
        ? `${column} in (${f.value.map(parameter).join(",")})`
        : "false";
    throw new Error("Unsupported filter");
  });
  const where = filters.length ? ` where ${filters.join(" and ")}` : "";
  let text: string;
  if (!operation.action || operation.action === "select") {
    const limit = operation.limit ?? 1000;
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
      throw new Error("Invalid limit");
    text = `select ${operation.count ? "count(*)::integer as count" : columns} from ${table}${where}`;
    if (!operation.count && operation.order)
      text += ` order by ${identifier(operation.order.column)} ${operation.order.ascending ? "asc" : "desc"}`;
    if (!operation.count) text += ` limit ${limit}`;
  } else if (operation.action === "delete") {
    if (!filters.length) throw new Error("Delete requires a filter");
    text = `delete from ${table}${where} returning ${columns}`;
  } else {
    const entries = Object.entries(operation.values || {});
    if (!entries.length || entries.length > 50)
      throw new Error("Values required");
    if (operation.action === "update") {
      if (!filters.length) throw new Error("Update requires a filter");
      text = `update ${table} set ${entries.map(([k, v]) => `${identifier(k)} = ${parameter(v)}`).join(",")}${where} returning ${columns}`;
    } else if (["insert", "upsert"].includes(operation.action)) {
      text = `insert into ${table} (${entries.map(([k]) => identifier(k)).join(",")}) values (${entries.map(([, v]) => parameter(v)).join(",")})`;
      if (operation.action === "upsert")
        text += ` on conflict (${identifier(operation.conflict || "id")}) do ${operation.ignoreDuplicates ? "nothing" : `update set ${entries.map(([k]) => `${identifier(k)} = excluded.${identifier(k)}`).join(",")}`}`;
      text += ` returning ${columns}`;
    } else throw new Error("Invalid action");
  }
  return { text, values, rpc: false };
}
export const setReturning = new Set(
  "timeline_page search_memories current_task_sources semantic_memories claim_jobs claim_deliveries".split(
    " ",
  ),
);
