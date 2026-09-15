import { NextRequest } from "next/server";
import { z } from "zod";
import { authorized, failure } from "@/lib/auth/server";
import { answer, embedText } from "@/lib/ai/provider";
import type { Memory } from "@/lib/domain/schema";
export async function POST(request: NextRequest) {
  try {
    const { client } = await authorized(request);
    const { question } = z
      .object({ question: z.string().min(1).max(2000) })
      .parse(await request.json());
    const terms = question.match(/[\p{L}\p{N}]{2,}/gu)?.slice(0, 8) || [];
    const { data, error } = await client.rpc("search_memories", {
      query_terms: terms,
      ai_only: false,
      result_limit: 20,
    });
    if (error) throw new Error(error.message);
    const sources = data || [];
    const p = await client.from("profiles").select("ai_consent").single();
    if (
      process.env.AI_PROVIDER !== "openai" ||
      !p.data?.ai_consent ||
      !process.env.OPENAI_API_KEY
    )
      return Response.json(
        {
          mode: "sources",
          message:
            "AI is not enabled. These keyword matches are original sources, not a generated answer. Search is bounded to 20 matches.",
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
          "AI budget unavailable or exhausted. Original source retrieval remains available.",
        sources,
      });
    const current = await client.rpc("search_memories", {
      query_terms: terms,
      ai_only: true,
      result_limit: 12,
    });
    let permitted: Memory[] = (current.data || []).filter(
      (s: { text: string }) => s.text.length <= 12000,
    );
    if (process.env.OPENAI_EMBEDDING_MODEL) {
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
              (s: Memory) => !seen.has(s.id) && s.text.length <= 12000,
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
      const result = await answer(question, permitted);
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
        client.from("profiles").select("ai_consent").single(),
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
          "AI answer with validated source quotes. Check the linked notes. Search covers up to 12 permitted matches within the context budget; it is not an exhaustive account audit.",
        sources: permitted,
        ...result,
      });
    } catch {
      return Response.json({
        mode: "sources",
        message:
          "AI unavailable or evidence validation failed. Here are the original keyword matches.",
        sources,
      });
    }
  } catch (e) {
    return failure(e);
  }
}
