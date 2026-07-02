import type { ClarificationPair } from "../types.ts";

/*
 * Q&A pairs as they appear in agent user messages (clarify round 2, draft).
 * A blank answer means the user skipped the question; render that explicitly
 * so the model treats the ambiguity as deliberately unresolved - the draft
 * agent surfaces it in openQuestions instead of guessing, and clarify round 2
 * doesn't re-ask a question the user chose not to answer.
 */

export function formatClarifications(pairs: ClarificationPair[]): string {
  return pairs
    .map(
      (p) =>
        `Q: ${p.question}\nA: ${p.answer.trim() === "" ? "(no answer provided)" : p.answer}`,
    )
    .join("\n\n");
}
