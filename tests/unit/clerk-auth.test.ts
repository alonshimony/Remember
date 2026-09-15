import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  query: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));
vi.mock("../../lib/db/postgres", () => ({
  database: () => ({ query: mocks.query }),
  transaction: (_owner: unknown, work: (client: unknown) => unknown) =>
    work({ query: mocks.query }),
}));
import { authorized, checkOrigin, ownerIdentity } from "../../lib/auth/server";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CLERK_SECRET_KEY", "synthetic");
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "synthetic");
});
it("rejects unsigned requests even when a caller supplies a forged owner ID", async () => {
  mocks.auth.mockResolvedValue({ userId: null });
  await expect(
    authorized(
      new NextRequest("https://remember.example/api/data", {
        method: "POST",
        headers: { "x-owner-id": "forged" },
        body: JSON.stringify({ owner_id: "forged" }),
      }),
    ),
  ).rejects.toThrow("Authentication required");
  expect(mocks.query).not.toHaveBeenCalled();
});
it("uses the verified Clerk subject mapping, never browser-supplied IDs", async () => {
  mocks.auth.mockResolvedValue({ userId: "user_verified" });
  mocks.query.mockResolvedValue({
    rows: [
      {
        id: "database-owner",
        email: "owner@example.test",
        clerk_id: "user_verified",
      },
    ],
  });
  const result = await authorized(
    new NextRequest("https://remember.example/api/data", {
      method: "POST",
      headers: { "x-owner-id": "forged" },
    }),
  );
  expect(result.user.id).toBe("database-owner");
  expect(mocks.query.mock.calls[0][1]).toEqual(["user_verified"]);
  expect(mocks.currentUser).not.toHaveBeenCalled();
});
it("refuses first-time provisioning without a verified, invited email", async () => {
  mocks.auth.mockResolvedValue({ userId: "user_new" });
  mocks.query.mockResolvedValue({ rows: [] });
  mocks.currentUser.mockResolvedValue({
    primaryEmailAddressId: "email_1",
    emailAddresses: [
      {
        id: "email_1",
        emailAddress: "stranger@example.test",
        verification: { status: "unverified" },
      },
    ],
  });
  await expect(ownerIdentity()).rejects.toThrow("Verify your email");
  mocks.currentUser.mockResolvedValue({
    primaryEmailAddressId: "email_1",
    emailAddresses: [
      {
        id: "email_1",
        emailAddress: "stranger@example.test",
        verification: { status: "verified" },
      },
    ],
  });
  await expect(ownerIdentity()).rejects.toThrow("not invited");
  expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith("insert"))).toBe(
    false,
  );
});
it("blocks cross-site cookie writes and accepts same-origin requests", () => {
  expect(() =>
    checkOrigin(
      new NextRequest("https://remember.example/api/data", {
        method: "POST",
        headers: { origin: "https://attacker.example" },
      }),
    ),
  ).toThrow("Origin rejected");
  expect(() =>
    checkOrigin(
      new NextRequest("https://remember.example/api/data", {
        method: "POST",
        headers: { "sec-fetch-site": "cross-site" },
      }),
    ),
  ).toThrow("Origin rejected");
  expect(() =>
    checkOrigin(
      new NextRequest("https://remember.example/api/data", {
        method: "POST",
        headers: { origin: "https://remember.example" },
      }),
    ),
  ).not.toThrow();
});
