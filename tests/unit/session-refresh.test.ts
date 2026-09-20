import { afterEach, expect, it, vi } from "vitest";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});
it("silently refreshes an expired token once and preserves the pending write", async () => {
  const { registerSessionRefresh, sessionFetch } =
    await import("../../lib/auth/browser");
  const refresh = vi.fn(async (fresh: boolean) =>
    fresh ? "fresh-token" : "expired-token",
  );
  registerSessionRefresh(refresh);
  const transport = vi
    .fn()
    .mockResolvedValueOnce(new Response("{}", { status: 401 }))
    .mockResolvedValueOnce(new Response('{"saved":true}', { status: 200 }));
  vi.stubGlobal("fetch", transport);
  const body = JSON.stringify({ text: "buy milk" });
  expect(
    (await sessionFetch("/api/data", { method: "POST", body })).status,
  ).toBe(200);
  expect(refresh.mock.calls).toEqual([[false], [true]]);
  expect(transport.mock.calls.map(([, init]) => init.body)).toEqual([
    body,
    body,
  ]);
  expect(transport.mock.calls[1][1].headers.get("Authorization")).toBe(
    "Bearer fresh-token",
  );
});
it("does not retry network or server failures and does not loop on an expired login", async () => {
  const { registerSessionRefresh, sessionFetch } =
    await import("../../lib/auth/browser");
  registerSessionRefresh(async () => null);
  const transport = vi
    .fn()
    .mockResolvedValue(new Response("{}", { status: 401 }));
  vi.stubGlobal("fetch", transport);
  expect((await sessionFetch("/api/data")).status).toBe(401);
  expect(transport).toHaveBeenCalledTimes(2);
  transport.mockClear().mockResolvedValue(new Response("{}", { status: 503 }));
  expect((await sessionFetch("/api/data")).status).toBe(503);
  expect(transport).toHaveBeenCalledTimes(1);
});
