import { NextRequest } from "next/server";
import { authorized, failure } from "@/lib/auth/server";
export async function GET(req: NextRequest) {
  try {
    await authorized(req);
    return Response.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
  } catch (e) {
    return failure(e);
  }
}
