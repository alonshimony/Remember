import { runWorker } from "@/lib/worker/run";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  return runWorker(request);
}
