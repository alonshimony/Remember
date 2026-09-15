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
    if (req.nextUrl.searchParams.get("download") !== "1")
      return Response.json(
        { url: `/api/attachments/${(await params).id}?download=1` },
        { headers: { "Cache-Control": "no-store" } },
      );
    const file = await client.storage
      .from("attachments")
      .download(data.storage_key);
    if (!file.data) throw new Error("Attachment not available");
    return new Response(file.data, {
      headers: {
        "Content-Type": file.data.type,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(data.name)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
