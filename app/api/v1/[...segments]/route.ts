import { NextRequest } from "next/server";
import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { z } from "zod";
import { admin, failure } from "@/lib/auth/server";
function encode(n: number, key: Buffer) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(n)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    "base64url",
  );
}
function decode(s: string, key: Buffer) {
  const b = Buffer.from(s, "base64url");
  const cipher = createDecipheriv("aes-256-gcm", key, b.subarray(0, 12));
  cipher.setAuthTag(b.subarray(12, 28));
  return Number(
    Buffer.concat([cipher.update(b.subarray(28)), cipher.final()]).toString(),
  );
}
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ segments: string[] }> },
) {
  try {
    const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
    if (!token || !/^rm_[\w-]{43}$/.test(token))
      return Response.json(
        { error: "Invalid integration token" },
        { status: 401 },
      );
    const [endpoint, id] = (await params).segments;
    z.enum([
      "memories",
      "timeline",
      "events",
      "entities",
      "search",
      "context",
      "changes",
      "commitments",
    ]).parse(endpoint);
    if (id) z.uuid().parse(id);
    const query = z
      .string()
      .max(500)
      .parse(req.nextUrl.searchParams.get("q") || "");
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .parse(req.nextUrl.searchParams.get("limit") || 30);
    const hash = createHash("sha256").update(token).digest();
    const cursor = req.nextUrl.searchParams.get("cursor");
    const { data, error } = await admin().rpc("integration_read", {
      token_hash: hash.toString("hex"),
      endpoint,
      object_id: id || null,
      query_text: query,
      after_cursor: cursor ? decode(cursor, hash) : 0,
      page_size: limit,
    });
    if (error)
      return Response.json(
        { error: "Invalid token or insufficient scope" },
        { status: 403 },
      );
    return Response.json(
      {
        ...data,
        next_cursor:
          data.next_cursor === null
            ? null
            : encode(Number(data.next_cursor), hash),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
