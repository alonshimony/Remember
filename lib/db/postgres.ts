import { Pool, types, type PoolClient } from "pg";
// Match the ISO strings expected by the offline store and archive format.
types.setTypeParser(1082, (value) => value);
types.setTypeParser(1184, (value) => new Date(value).toISOString());
let pool: Pool | undefined;
export function database() {
  if (!process.env.DATABASE_URL)
    throw new Error(
      "Set DATABASE_URL to your Neon connection string, then redeploy.",
    );
  return (pool ||= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 15000,
  }));
}
export async function transaction<T>(
  owner: string | null,
  work: (client: PoolClient) => Promise<T>,
) {
  const client = await database().connect();
  try {
    await client.query("begin");
    await client.query("set local statement_timeout = '25s'");
    if (owner) {
      await client.query("set local role authenticated");
      await client.query(
        "select set_config('request.jwt.claim.sub', $1, true)",
        [owner],
      );
    }
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
