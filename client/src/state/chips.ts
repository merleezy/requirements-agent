import type { PRD } from "../types";

/*
 * Step 9: the chat panel's suggested-feedback chips, derived from the live
 * PRD so they track the document rather than staying static sample copy.
 * Each chip shows a short `label` but sends a fuller `message` through the
 * normal revise-global send path.
 */

export interface ChatChip {
  label: string;
  message: string;
}

const MAX_QUESTION_CHIPS = 3;
const LABEL_MAX = 40;

function truncate(text: string): string {
  const t = text.trim();
  return t.length <= LABEL_MAX ? t : `${t.slice(0, LABEL_MAX - 1).trimEnd()}…`;
}

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
    label: `Make a call on: "${truncate(q.text)}"`,
    message: `Use your best judgment to resolve this open question and update the PRD accordingly: "${q.text}"`,
  }));
}
