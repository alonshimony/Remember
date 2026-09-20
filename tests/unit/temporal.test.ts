import { expect, it } from "vitest";
import {
  askScope,
  taskSources,
  temporalContext,
  type TemporalMemory,
} from "../../lib/domain/temporal";
it("recognizes present-day tasks and retains explicit historical questions", () => {
  expect(askScope("What do I need to do?")).toBe("current_tasks");
  expect(askScope("מה אני צריך לעשות?")).toBe("current_tasks");
  expect(askScope("What did I need to buy two weeks ago?")).toBe("history");
  expect(askScope("What do I need to do?", "history")).toBe("history");
  expect(askScope("Plans?", "current_tasks")).toBe("current_tasks");
});
it("sends only active task quotes from mixed old notes, preserving original citation evidence", () => {
  const row = {
    id: "fixture",
    text: "I have to buy some milk. Renew my passport.",
    no_ai: false,
    captured_at: "2026-09-01T10:00:00Z",
    occurred_on: null,
    action_scope: "commitments",
    action_evidence: [
      {
        id: "task",
        description: "Renew my passport.",
        quote: "Renew my passport.",
        status: "open",
        due_on: "2026-10-01",
      },
    ],
  } as TemporalMemory;
  const sources = taskSources([row]);
  expect(sources[0].text).not.toContain("milk");
  expect(sources[0].original_text).toBe(row.text);
  const context = temporalContext(
    sources,
    "current_tasks",
    "Asia/Jerusalem",
    new Date("2026-09-20T22:00:00Z"),
  );
  expect(context.local_date).toBe("2026-09-21");
  expect(JSON.stringify(context)).not.toContain("milk");
  expect(context.sources[0].captured_at).toBe(row.captured_at);
  expect(
    taskSources([
      {
        ...row,
        action_evidence: [{ ...row.action_evidence![0], quote: null }],
      },
    ]),
  ).toEqual([]);
});
