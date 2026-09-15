import { NextRequest } from "next/server";
import { authorized, failure } from "@/lib/auth/server";
import {
  createArchive,
  inspectArchive,
  validateRestoreRecords,
  type ArchiveData,
} from "@/lib/export/archive";
export async function GET(req: NextRequest) {
  try {
    const { client } = await authorized(req);
    const snapshot = await client.rpc("archive_snapshot");
    if (snapshot.error) throw new Error(snapshot.error.message);
    const data: ArchiveData = snapshot.data;
    const files: Record<string, Uint8Array> = {};
    let bytes = 0;
    for (const attachment of data.attachments) {
      if ((bytes += Number(attachment.size)) > 3 * 1024 * 1024)
        throw new Error(
          "Attachment total exceeds interactive 3 MB archive limit",
        );
      const result = await client.storage
        .from("attachments")
        .download(String(attachment.storage_key));
      if (result.data)
        files[`attachments/${attachment.id}`] = new Uint8Array(
          await result.data.arrayBuffer(),
        );
    }
    const archive = await createArchive(data, files);
    if (archive.length > 4 * 1024 * 1024)
      throw new Error(
        "Archive exceeds the 4 MB Vercel download limit. Export fewer records using scoped integrations; multipart archives are not implemented yet.",
      );
    return new Response(archive as Uint8Array<ArrayBuffer>, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="remember-backup.zip"',
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    const { client, user } = await authorized(req);
    const body = await req.formData();
    const file = body.get("file");
    if (!(file instanceof File)) throw new Error("Archive file required");
    if (file.size > 4 * 1024 * 1024)
      throw new Error("Maximum archive upload is 4 MB");
    const archive = await inspectArchive(
      new Uint8Array(await file.arrayBuffer()),
    );
    validateRestoreRecords(archive.data, user.id);
    if (
      Object.values(archive.data)
        .flat()
        .some((r) => r.owner_id !== user.id)
    )
      throw new Error(
        "Foreign-owner archive needs an explicit remapping flow; automatic restore refused",
      );
    if (body.get("confirm") !== "restore")
      return Response.json({
        preview: archive.manifest,
        reminders: "Restored reminders will be pending review",
        action: "Review the counts and confirm restore",
      });
    const result = await client.rpc("restore_archive", {
      archive_id: archive.manifest.id,
      dataset: archive.data,
    });
    if (result.error) throw new Error(result.error.message);
    for (const attachment of archive.data.attachments) {
      const bytes = archive.files[`attachments/${attachment.id}`];
      if (!bytes) throw new Error("Missing attachment bytes");
      const upload = await client.storage
        .from("attachments")
        .upload(String(attachment.storage_key), bytes, {
          contentType: String(attachment.mime),
          upsert: true,
        });
      if (upload.error)
        throw new Error(
          "Records restored; attachment upload incomplete. Retry this archive.",
        );
      await client
        .from("attachments")
        .update({ state: "uploaded" })
        .eq("id", attachment.id);
    }
    return Response.json({
      restored: true,
      reminders: "Pending review; no notifications sent",
    });
  } catch (e) {
    return failure(e);
  }
}
