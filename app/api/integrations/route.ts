import { NextRequest } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { authorized, failure } from "@/lib/auth/server";
export async function POST(req: NextRequest) {
  try {
    const { client } = await authorized(req);
    const input = z
      .object({
        spaces: z.array(z.uuid()).min(1),
        days: z.number().int().min(1).max(365),
      })
      .parse(await req.json());
    const token = `rm_${randomBytes(32).toString("base64url")}`;
    const { error } = await client.rpc("issue_integration", {
      token_hash: createHash("sha256").update(token).digest("hex"),
      token_prefix: token.slice(0, 10),
      allowed_spaces: input.spaces,
      allowed_scopes: [
        "memories",
        "timeline",
        "events",
        "entities",
        "search",
        "context",
        "changes",
        "commitments",
      ],
      expiry: new Date(Date.now() + input.days * 86400000).toISOString(),
    });
    if (error) throw new Error(error.message);
    return Response.json(
      { token },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
