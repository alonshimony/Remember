import { it, expect } from "vitest";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const execute = promisify(execFile);
it("X09 real CLI safely retries and propagates tombstones without deleting unrelated files", async () => {
  const id = crypto.randomUUID();
  let deleted = false;
  const server = createServer((req, res) => {
    if (req.headers.authorization !== "Bearer synthetic") {
      res.writeHead(403);
      res.end("{}");
      return;
    }
    const url = new URL(req.url!, "http://localhost");
    const cursor = url.searchParams.get("cursor");
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        data:
          cursor === (deleted ? "2" : "1")
            ? []
            : [
                {
                  id,
                  operation: deleted ? "delete" : "upsert",
                  memory: deleted
                    ? null
                    : { id, text: "Synthetic שלום", captured_at: "2026-09-15" },
                },
              ],
        next_cursor: deleted ? "2" : "1",
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const folder = await mkdtemp(join(tmpdir(), "remember-sync-test-"));
  try {
    await writeFile(join(folder, "unrelated.txt"), "Keep me");
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const run = () =>
      execute(
        process.execPath,
        ["--import", "tsx", "tools/memory-sync/index.ts", "--folder", folder],
        {
          env: {
            ...process.env,
            REMEMBER_URL: url,
            REMEMBER_TOKEN: "synthetic",
          },
        },
      );
    await run();
    await run();
    expect(await readFile(join(folder, `${id}.md`), "utf8")).toContain(
      "Synthetic שלום",
    );
    deleted = true;
    await run();
    expect(await readFile(join(folder, "unrelated.txt"), "utf8")).toBe(
      "Keep me",
    );
    await expect(readFile(join(folder, `${id}.md`))).rejects.toThrow();
  } finally {
    server.close();
    await rm(folder, { recursive: true, force: true });
  }
});
it("X10 real MCP handshake exposes exactly five read-only tools", async () => {
  const client = new Client({ name: "remember-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "tools/mcp/index.ts"],
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          (x): x is [string, string] => typeof x[1] === "string",
        ),
      ),
      REMEMBER_URL: "http://127.0.0.1:1",
      REMEMBER_TOKEN: "synthetic",
    },
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        "search_memories",
        "get_memory",
        "get_timeline",
        "get_entity_context",
        "get_open_commitments",
      ].sort(),
    );
    expect(tools.every((t) => t.annotations?.readOnlyHint)).toBe(true);
    expect(
      (await client.callTool({ name: "delete_memory", arguments: {} })).isError,
    ).toBe(true);
  } finally {
    await client.close();
  }
});
