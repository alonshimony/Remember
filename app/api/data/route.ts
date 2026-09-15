import { NextRequest } from "next/server";
import { authorized, failure } from "@/lib/auth/server";
export async function POST(request: NextRequest) {
  try {
    const { client } = await authorized(request);
    const body = await request.text();
    if (body.length > 1024 * 1024) throw new Error("Request too large");
    const operation = JSON.parse(body);
    if (!operation || typeof operation !== "object" || Array.isArray(operation))
      throw new Error("Invalid request");
    const result = await client.execute(operation);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
