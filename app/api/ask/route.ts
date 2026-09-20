import { NextRequest } from "next/server";
import { z } from "zod";
import { authorized, failure } from "@/lib/auth/server";
import { answer, embedText } from "@/lib/ai/provider";
import {
  askScope,
  taskSources,
  type TemporalMemory,
} from "@/lib/domain/temporal";
export async function POST(request: NextRequest) {
  try {
    const { client } = await authorized(request);
    const { question, scope: requestedScope } = z
      .object({
        question: z.string().min(1).max(2000),
        scope: z.enum(["auto", "current_tasks", "history"]).default("auto"),
      })
      .parse(await request.json());
    const scope = askScope(question, requestedScope);
    const currentTasks = scope === "current_tasks";
    const terms = question.match(/[\p{L}\p{N}]{2,}/gu)?.slice(0, 8) || [];
    const retrieve = (aiOnly: boolean) =>
      currentTasks
        ? client.rpc("current_task_sources", { ai_only: aiOnly })
        : client.rpc("search_memories", {
            query_terms: terms,
            ai_only: aiOnly,
            result_limit: 20,
          });
    const { data, error } = await retrieve(false);
    if (error) throw new Error(error.message);
    const sources: TemporalMemory[] = currentTasks
      ? taskSources(data || [])
      : data || [];
    const scopeMessage = currentTasks
      ? "Current tasks: recent intentions from the last 7 days, recently confirmed tasks, and confirmed future deadlines. Older notes remain in your timeline; hidden does not mean completed. "
      : "Historical memories; old intentions are not assumed to still be current. ";
    if (currentTasks && !sources.length)
      return Response.json(
        {
          mode: "sources",
          message:
            scopeMessage +
            "I found no supported current tasks in the recent evidence. This does not mean everything has been completed.",
          sources: [],
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    const p = await client
      .from("profiles")
      .select("ai_consent,timezone")
      .single();
    if (
      process.env.AI_PROVIDER !== "openai" ||
      !p.data?.ai_consent ||
      !process.env.OPENAI_API_KEY
    )
      return Response.json(
        {
          mode: "sources",
          message:
            scopeMessage +
            "AI is not enabled. These are original sources, not a generated task list. Retrieval is bounded to the most recent matching evidence.",
          sources,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    const permit = await client.rpc("consume_ai_budget", {
      daily_limit: Number(process.env.AI_DAILY_REQUEST_LIMIT || 30),
    });
    if (permit.error || !permit.data)
      return Response.json({
        mode: "sources",
        message:
          scopeMessage +
          "AI budget unavailable or exhausted. Original source retrieval remains available.",
        sources,
      });
    const current = await retrieve(true);
    if (current.error) throw new Error(current.error.message);
    let permitted: TemporalMemory[] = (
      currentTasks ? taskSources(current.data || []) : current.data || []
    )
      .filter((s: TemporalMemory) => s.text.length <= 12000)
      .slice(0, 12);
    if (!currentTasks && process.env.OPENAI_EMBEDDING_MODEL) {
      try {
        const embedding = await embedText(question);
        const semantic = await client.rpc("semantic_memories", {
          query_embedding: embedding.vector,
          embedding_model: embedding.model,
          result_limit: 12,
        });
        if (!semantic.error) {
          const seen = new Set(
            permitted.map(
              (s: {
                id: string;
                current_revision: number;
                no_ai: boolean;
                deleted_at: string | null;
              }) => s.id,
            ),
          );
          permitted = [
            ...permitted,
            ...(semantic.data || []).filter(
              (s: TemporalMemory) => !seen.has(s.id) && s.text.length <= 12000,
            ),
          ].slice(0, 12);
        }
      } catch {
        /* Original lexical sources remain usable. */
      }
    }
    let contextSize = 0;
    permitted = permitted.filter((s) => {
      contextSize += s.text.length;
      return contextSize <= 32000;
    });
    try {
      const result = await answer(question, permitted, {
        scope,
        timezone: p.data?.timezone || "UTC",
      });
      // Re-run time/status eligibility to catch a task completed or cancelled during the provider call.
      const eligibleNow = currentTasks ? await retrieve(true) : null;
      if (
        eligibleNow &&
        (eligibleNow.error ||
          JSON.stringify(
            taskSources(eligibleNow.data || [])
              .filter((s) => permitted.some((p) => p.id === s.id))
              .map((s) => ({
                id: s.id,
                text: s.text,
                evidence: s.action_evidence,
              })),
          ) !==
            JSON.stringify(
              permitted.map((s) => ({
                id: s.id,
                text: s.text,
                evidence: s.action_evidence,
              })),
            ))
      )
        throw new Error("Task relevance changed");
      const [fresh, consent] = await Promise.all([
        client
          .from("memory_view")
          .select("id,current_revision,no_ai,deleted_at")
          .in(
            "id",
            permitted.map(
              (s: {
                id: string;
                current_revision: number;
                no_ai: boolean;
                deleted_at: string | null;
              }) => s.id,
            ),
          ),
        client.from("profiles").select("ai_consent,timezone").single(),
      ]);
      if (
        fresh.error ||
        !consent.data?.ai_consent ||
        permitted.some(
          (source) =>
            !fresh.data?.some(
              (s: {
                id: string;
                current_revision: number;
                no_ai: boolean;
                deleted_at: string | null;
              }) =>
                s.id === source.id &&
                s.current_revision === source.current_revision &&
                !s.no_ai &&
                !s.deleted_at,
            ),
        )
      )
        return Response.json({
          mode: "sources",
          message:
            "A source or privacy setting changed while answering. Please run the question again.",
          sources: [],
        });
      return Response.json({
        mode: "ai",
        message:
          scopeMessage +
          "AI answer with validated source quotes. Check the linked notes. Search covers up to 12 permitted matches within the context budget; it is not an exhaustive account audit.",
        sources: permitted,
        ...result,
      });
    } catch {
      return Response.json({
        mode: "sources",
        message:
          scopeMessage +
          "AI unavailable or evidence changed. Please ask again.",
        sources: [],
      });
    }
  } catch (e) {
    return failure(e);
  }
}
