import { clerkClient } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { authorized, admin, failure } from "@/lib/auth/server";
import { z } from "zod";
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { client, user } = await authorized(req);
    const { password } = z
      .object({ password: z.string().min(1).max(200) })
      .parse(await req.json());
    const id = z.uuid().parse((await params).id);
    try {
      const proof = await (
        await clerkClient()
      ).users.verifyPassword({ userId: user.clerk_id, password });
      if (!proof.verified) throw new Error("Invalid password");
    } catch {
      throw new Error(
        "Reauthentication failed. Use your Clerk password; passwordless accounts must add a password in Clerk before permanent deletion.",
      );
    }
    const capture = await client
      .from("captures")
      .select("deleted_at")
      .eq("id", id)
      .single();
    if (!capture.data?.deleted_at)
      throw new Error("Move the memory to Trash first");
    const files = await client
      .from("attachments")
      .select("storage_key")
      .eq("capture_id", id);
    if (files.error) throw new Error("Attachment check failed");
    if (files.data.length) {
      const removed = await client.storage
        .from("attachments")
        .remove(files.data.map((f: { storage_key: string }) => f.storage_key));
      if (removed.error)
        throw new Error("Attachment cleanup failed; memory retained");
      await client
        .from("attachments")
        .update({ state: "removed" })
        .eq("capture_id", id);
    }
    const purged = await admin().rpc("purge_capture_verified", {
      cid: id,
      for_owner: user.id,
    });
    if (purged.error) throw new Error(purged.error.message);
    return Response.json({ purged: true });
  } catch (e) {
    return failure(e);
  }
}
