import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { database, transaction } from "../db/postgres";
import { serverClient } from "../db/server";
export function admin() {
  return serverClient(null);
}
export function checkOrigin(request: NextRequest) {
  if (!["GET", "HEAD"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (
      origin &&
      origin !== new URL(request.url).origin &&
      origin !== process.env.APP_URL
    )
      throw new Error("Origin rejected");
    if (request.headers.get("sec-fetch-site") === "cross-site")
      throw new Error("Origin rejected");
  }
}
export async function ownerIdentity() {
  if (
    !process.env.CLERK_SECRET_KEY ||
    !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  )
    throw new Error("Configure Clerk keys and redeploy.");
  const session = await auth();
  if (!session.userId) throw new Error("Authentication required");
  const existing = await database().query(
    "select u.id,u.email,u.clerk_id from auth.users u join public.invited_owners i on i.email=u.email where u.clerk_id=$1",
    [session.userId],
  );
  if (existing.rows[0])
    return existing.rows[0] as { id: string; email: string; clerk_id: string };
  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses
    .find(
      (e) =>
        e.id === clerkUser.primaryEmailAddressId &&
        e.verification?.status === "verified",
    )
    ?.emailAddress.toLowerCase();
  if (!email)
    throw new Error(
      "Verify your email in Clerk before opening your workspace.",
    );
  return transaction(null, async (c) => {
    const allowed = await c.query(
      "select email from public.invited_owners where email=$1",
      [email],
    );
    if (!allowed.rows.length)
      throw new Error("This account is not invited to this workspace.");
    const result = await c.query(
      "insert into auth.users(email,clerk_id) values($1,$2) on conflict(clerk_id) do update set clerk_id=excluded.clerk_id returning id,email,clerk_id",
      [email, session.userId],
    );
    return result.rows[0] as { id: string; email: string; clerk_id: string };
  });
}
export async function authorized(request: NextRequest) {
  checkOrigin(request);
  const user = await ownerIdentity();
  return { client: serverClient(user.id), user };
}
export function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Request failed";
  return Response.json(
    { error: message },
    {
      status:
        message === "Authentication required"
          ? 401
          : message === "Origin rejected" || message.includes("not invited")
            ? 403
            : 400,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
