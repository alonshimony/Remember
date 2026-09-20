import type { Memory } from "./schema";
export type AskScope = "auto" | "current_tasks" | "history";
export type ActionEvidence = {
  id: string;
  description: string;
  status: string;
  due_on: string | null;
  quote: string | null;
};
export type TemporalMemory = Memory & {
  action_scope?: "commitments" | "recent_note";
  action_evidence?: ActionEvidence[];
  original_text?: string;
};
// Explicit UI scope handles other languages/ambiguous questions; automatic detection is conservative.
export function askScope(
  question: string,
  requested: AskScope = "auto",
): Exclude<AskScope, "auto"> {
  if (requested !== "auto") return requested;
  if (
    /\b(did|used to|histor(?:y|ical)|last (?:week|month|year)|ago|back then)\b|מה (?:הייתי|עשיתי)|בעבר|לפני שבוע/u.test(
      question.toLowerCase(),
    )
  )
    return "history";
  return /\b(need to|have to|should i|must i|to[ -]?do|tasks?|priorit(?:y|ies)|still (?:owe|need)|what(?:'s| is) (?:next|outstanding)|what.*(?:do today|do now|due)|what to do)\b|מה.*(?:צריך|לעשות)|משימות|מה נשאר/iu.test(
    question,
  )
    ? "current_tasks"
    : "history";
}
export function taskSources(rows: TemporalMemory[]): TemporalMemory[] {
  return rows.flatMap((row) => {
    if (row.action_scope !== "commitments") return [row];
    const evidence = (row.action_evidence || []).filter(
      (e) => e.quote && row.text.includes(e.quote),
    );
    if (!evidence.length) return [];
    // Do not send unrelated stale tasks from the same old note to the model.
    const quotes = [...new Set(evidence.map((e) => e.quote!))];
    return [
      {
        ...row,
        original_text: row.text,
        text: quotes.join("\n\n"),
        action_evidence: evidence,
      },
    ];
  });
}
export function temporalContext(
  sources: TemporalMemory[],
  scope: Exclude<AskScope, "auto">,
  timezone: string,
  now = new Date(),
) {
  return {
    as_of: now.toISOString(),
    local_date: new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now),
    timezone,
    scope,
    undated_intention_window_days: 7,
    sources: sources.map(
      ({
        id,
        text,
        no_ai,
        captured_at,
        occurred_on,
        action_scope,
        action_evidence,
      }) => ({
        id,
        text,
        no_ai,
        captured_at,
        occurred_on,
        action_scope,
        action_evidence,
      }),
    ),
  };
}
