import { NextRequest } from "next/server";
import { authorized, failure } from "@/lib/auth/server";
import { validateFile } from "@/lib/security/files";
import { digest } from "@/lib/export/archive";
export async function POST(req: NextRequest) {
  try {
    const { client, user } = await authorized(req);
    if (Number(req.headers.get("content-length") || 0) > 11 * 1024 * 1024)
      throw new Error("File too large");
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("File required");
    const { data: memory, error } = await client
      .from("captures")
      .select("id,space_id")
      .eq("id", form.get("capture_id"))
      .is("deleted_at", null)
      .single();
    if (error || !memory) throw new Error("Memory not available");
    const { count } = await client
      .from("attachments")
      .select("id", { count: "exact", head: true })
      .eq("capture_id", memory.id);
    if ((count || 0) >= 10)
      throw new Error("Maximum 10 attachments per memory");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = validateFile(file.name, file.type, bytes);
    const id = crypto.randomUUID(),
      storage_key = `${user.id}/${memory.id}/${id}`;
    const row = {
      id,
      owner_id: user.id,
      space_id: memory.space_id,
      capture_id: memory.id,
      name: file.name.slice(0, 200),
      mime,
      size: bytes.length,
      sha256: await digest(bytes),
      storage_key,
      state: "pending",
    };
    const inserted = await client.from("attachments").insert(row);
    if (inserted.error) throw new Error(inserted.error.message);
    const upload = await client.storage
      .from("attachments")
      .upload(storage_key, bytes, { contentType: mime, upsert: false });
    if (upload.error)
      throw new Error("Attachment upload failed; text is still saved");
    const updated = await client
      .from("attachments")
      .update({ state: "uploaded" })
      .eq("id", id);
    if (updated.error)
      throw new Error("Upload complete but metadata acknowledgement failed");
    return Response.json({ id, state: "uploaded" });
  } catch (e) {
    return failure(e);
  }
}
