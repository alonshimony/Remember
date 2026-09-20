import { afterEach, expect, it, vi } from "vitest";
import { answer } from "../../lib/ai/provider";
import { taskSources, type TemporalMemory } from "../../lib/domain/temporal";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("sends dated, narrowed evidence and rejects a citation to an omitted stale intention", async () => {
  vi.stubEnv("OPENAI_ANSWER_MODEL", "synthetic-model");
  vi.stubEnv("OPENAI_API_KEY", "synthetic-key");
  const id = "11111111-1111-4111-8111-111111111111";
  const sources = taskSources([
    {
      id,
      text: "Buy milk. Renew passport.",
      captured_at: "2026-01-01T00:00:00Z",
      occurred_on: null,
      no_ai: false,
      action_scope: "commitments",
      action_evidence: [
        {
          id: "task",
          description: "Renew passport.",
          quote: "Renew passport.",
          status: "open",
          due_on: "2027-01-01",
        },
      ],
    } as TemporalMemory,
  ]);
  const transport = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    statements: [
                      {
                        source_id: id,
                        quote: "Buy milk.",
                        text: "You need to buy milk.",
                      },
                    ],
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
  vi.stubGlobal("fetch", transport);
  await expect(
    answer("What do I need to do?", sources, {
      scope: "current_tasks",
      timezone: "UTC",
    }),
  ).rejects.toThrow("Missing or ambiguous evidence");
  const body = JSON.parse(transport.mock.calls[0][1].body);
  const context = JSON.parse(body.input[1].content);
  expect(context.as_of).toBeTruthy();
  expect(context.sources[0].captured_at).toBe("2026-01-01T00:00:00Z");
  expect(context.sources[0].text).toBe("Renew passport.");
  expect(JSON.stringify(context)).not.toContain("milk");
});
