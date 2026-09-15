import { NextRequest } from "next/server";
import { authorized, failure } from "@/lib/auth/server";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { client } = await authorized(req);
    const { data, error } = await client
      .from("attachments")
      .select("storage_key,name")
      .eq("id", (await params).id)
      .single();
    if (error || !data) throw new Error("Attachment not found");
    const signed = await client.storage
      .from("attachments")
      .createSignedUrl(data.storage_key, 60, { download: data.name });
    if (signed.error) throw new Error("Attachment not available");
    return Response.json(
      { url: signed.data.signedUrl, expires_in: 60 },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
