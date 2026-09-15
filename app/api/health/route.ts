import { NextRequest } from "next/server";
import { authorized, failure } from "@/lib/auth/server";
export async function GET(req: NextRequest) {
  try {
    const { client } = await authorized(req);
    const [j, h] = await Promise.all([
      client.from("jobs").select("status"),
      client.from("worker_health").select("last_run").maybeSingle(),
    ]);
    return Response.json(
      {
        ai_provider:
          process.env.AI_PROVIDER === "openai" && process.env.OPENAI_API_KEY
            ? "Configured; live provider verification required"
            : "No external AI",
        queued_jobs:
          j.data?.filter((x: { status: string }) =>
            ["pending", "retry", "running"].includes(x.status),
          ).length ?? "Unavailable",
        dead_jobs:
          j.data?.filter((x: { status: string }) => x.status === "dead")
            .length ?? "Unavailable",
        last_worker_heartbeat:
          h.data?.last_run || "Not configured or never run",
        push: process.env.VAPID_PUBLIC_KEY
          ? "Configured; delivery needs device verification"
          : "Not configured",
        external_backup: process.env.BACKUP_DESTINATION
          ? "Destination configured; restore verification required"
          : "External backup not configured",
        release:
          "Preview — see docs/BUILD_STATE.md for incomplete release gates",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
