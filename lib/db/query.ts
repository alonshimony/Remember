/* eslint-disable @typescript-eslint/no-explicit-any */
// A small transport-neutral query builder. SQL is compiled only on the server.
export type Result<T = any> = {
  data: T;
  error: { message: string } | null;
  count?: number;
};
export type Operation = {
  table?: string;
  rpc?: string;
  args?: Record<string, unknown>;
  action?: "select" | "insert" | "update" | "delete" | "upsert";
  columns?: string;
  values?: Record<string, unknown>;
  conflict?: string;
  ignoreDuplicates?: boolean;
  filters?: { column: string; op: string; value: unknown }[];
  order?: { column: string; ascending: boolean };
  limit?: number;
  single?: boolean;
  optional?: boolean;
  count?: boolean;
  head?: boolean;
};
export type Execute = (operation: Operation) => Promise<Result>;
export class Query implements PromiseLike<Result> {
  constructor(
    private execute: Execute,
    private operation: Operation,
  ) {}
  select(columns = "*", options?: { count?: string; head?: boolean }) {
    Object.assign(this.operation, {
      columns,
      count: !!options?.count,
      head: options?.head,
    });
    return this;
  }
  insert(values: Record<string, unknown>) {
    Object.assign(this.operation, { action: "insert", values });
    return this;
  }
  update(values: Record<string, unknown>) {
    Object.assign(this.operation, { action: "update", values });
    return this;
  }
  delete() {
    this.operation.action = "delete";
    return this;
  }
  upsert(
    values: Record<string, unknown>,
    options?: { onConflict?: string; ignoreDuplicates?: boolean },
  ) {
    Object.assign(this.operation, {
      action: "upsert",
      values,
      conflict: options?.onConflict || "id",
      ignoreDuplicates: options?.ignoreDuplicates,
    });
    return this;
  }
  private filter(column: string, op: string, value: unknown) {
    (this.operation.filters ||= []).push({ column, op, value });
    return this;
  }
  eq(column: string, value: unknown) {
    return this.filter(column, "eq", value);
  }
  is(column: string, value: unknown) {
    return this.filter(column, "is", value);
  }
  in(column: string, value: unknown[]) {
    return this.filter(column, "in", value);
  }
  not(column: string, op: string, value: unknown) {
    if (op !== "is" || value !== null) throw new Error("Unsupported filter");
    return this.filter(column, "not-null", value);
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.operation.order = { column, ascending: options?.ascending !== false };
    return this;
  }
  limit(limit: number) {
    this.operation.limit = limit;
    return this;
  }
  single() {
    this.operation.single = true;
    return this;
  }
  maybeSingle() {
    Object.assign(this.operation, { single: true, optional: true });
    return this;
  }
  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute(this.operation).then(onfulfilled, onrejected);
  }
}
export function queryClient(execute: Execute) {
  return {
    from: (table: string) => new Query(execute, { table, action: "select" }),
    rpc: (rpc: string, args: Record<string, unknown> = {}) =>
      execute({ rpc, args }),
  };
}
