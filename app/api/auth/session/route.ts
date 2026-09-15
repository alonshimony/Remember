import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { ownerIdentity, checkOrigin, failure } from "@/lib/auth/server";
export async function GET() {
  try {
    const { id, email } = await ownerIdentity();
    return Response.json(
      { user: { id, email } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(request: NextRequest) {
  try {
    checkOrigin(request);
    const { sessionId } = await auth();
    if (sessionId)
      await (await clerkClient()).sessions.revokeSession(sessionId);
    return Response.json({ signedOut: true });
  } catch (error) {
    return failure(error);
  }
}
