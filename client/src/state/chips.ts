import type { PRD } from "../types";

/*
 * Step 9: the chat panel's suggested-feedback chips, derived from the live
 * PRD so they track the document rather than staying static sample copy.
 * Each chip shows the full question text as its `label` and sends a
 * structured message through the normal revise-global send path.
 */

export interface ChatChip {
  label: string;
  message: string;
}

const MAX_QUESTION_CHIPS = 3;

/* Up to 3 chips that let the user hand an open question back to Draftsmith,
 * or - when nothing is open - one generic "tighten the wording" prompt. */
export function deriveChatChips(prd: PRD): ChatChip[] {
  const questions = prd.openQuestions.slice(0, MAX_QUESTION_CHIPS);
  if (questions.length === 0) {
    return [
      {
        label: "Tighten vague wording",
        message:
          "Rewrite any vague or untestable wording across the document to be concrete and testable.",
      },
    ];
  }
  return questions.map((q) => ({
    label: q.text,
    message:
      `Resolve this open question and update the PRD: "${q.text}". ` +
      `Remove it from openQuestions once resolved, and add or change requirements or other sections as needed.`,
  }));
}
