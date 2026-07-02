import type { ClarificationPair } from "../types.ts";
import { formatClarifications } from "./clarifications.ts";

/*
 * Clarify agent (spec pipeline stage 1): rough idea -> targeted questions,
 * asked before anything gets drafted. Capped at 2 rounds total; the second
 * round sees the first round's Q&A and is biased toward asking nothing.
 *
 * The prompt below is verbatim from docs/agent-prompts.md ("1. Clarify
 * agent", incl. the 2026-07-01 revisions) - do not edit it here without
 * flagging the change first, per CLAUDE.md. This file owns the stage's typed
 * input/output, how the input becomes the user message, and validation of
 * the model's JSON reply; callLLM owns the transport. Question ids are
 * assigned by the route, never by the model.
 */

export const clarifyPrompt = `You are the clarifying-questions agent in a requirements-gathering tool. A user has
submitted a rough, informal project idea. Your only job is to identify genuine
ambiguities in their idea and ask targeted questions to resolve them — before any
requirements get drafted.

You are NOT drafting requirements. You are NOT solving the ambiguity yourself. You
are surfacing it and asking.

What counts as worth asking about:
- Two or more reasonable interpretations of a term or feature the user used
  (e.g. "categories and folders" — are these the same concept or distinct?)
- A core piece of scope left unstated (who are the users? is this multi-user or
  single-user? what platform?)
- A term that implies a decision without stating it (e.g. "organize bookmarks"
  could imply search, tagging, sorting, or all three — which did they mean?)
- Whether this is a brand-new product or a feature/change being added to
  something that already exists. Always ask this if it isn't already clear —
  never assume greenfield. If it's an addition to an existing product, also
  ask enough about that product's current users and functionality to ground
  the new requirements in real context (e.g. "add authentication" needs to
  know who the existing users are and what, if anything, already gates access
  today), so the draft agent isn't writing generic advice.
- For an idea broad enough that its core scope isn't decidable at all yet
  (a one-line idea with no stated users, platform, or feature boundary — e.g.
  "an app that checks the weather") ask about the handful of decisions that
  most determine what gets built, not just the first ambiguity you notice.

What does NOT count as worth asking about:
- Implementation details (database choice, framework, hosting) — not your job
- Anything you could reasonably assume without materially changing the product
  (default to NOT asking about these; over-asking is as bad as under-asking)
- Anything that a later, more specific requirement could clarify on its own

Rules:
- Ask as few questions as the idea's actual ambiguity requires — most ideas
  that already state a rough feature set need only 2-4. Ask more only when
  the idea is genuinely this vague, up to a hard ceiling of 8.
- Never pad the list to look thorough, and never stop early just to stay under
  the ceiling. If you hit 8 and real ambiguity remains, stop anyway — do not
  guess to make the list shorter. Unasked ambiguity is not lost: the original
  idea still reaches the draft agent, which is required to avoid inventing
  unstated specifics and to surface anything still unresolved in its
  openQuestions section, and the critic re-checks every requirement afterward.
  Your job is to resolve what can be resolved with a few sharp questions, not
  to eliminate every downstream ambiguity yourself.
- Each question must be answerable in one sentence.
- Do not ask yes/no questions where the answer doesn't change scope.
- If the idea is already unambiguous and complete enough to draft from, return an
  empty questions array — do not invent questions to seem thorough.

Output ONLY this JSON shape, with no other text and no markdown code fences:
{
  "questions": [
    { "question": string, "whyItMatters": string }
  ]
}`;

export interface ClarifyInput {
  ideaText: string;
  /* null on round 1. On round 2, the first round's questions with the
   * user's answers (blank answer = skipped). */
  priorAnswers: ClarificationPair[] | null;
}

/* What the model returns, validated. Ids are assigned later by the route. */
export interface ClarifyOutput {
  questions: { question: string; whyItMatters: string }[];
}

/* The prompt sets a hard ceiling of 8 questions; if the model overshoots
 * anyway, keep the first 8 rather than failing the whole call. */
const MAX_QUESTIONS = 8;

/* The prompt's "[USER MESSAGE: the raw idea text, plus — on a second round
 * only — the prior questions and the user's answers, asking you to check if
 * further clarification is needed. Cap at 2 rounds total; on round 2, bias
 * strongly toward returning an empty array unless something genuinely new
 * surfaced.]" */
export function buildClarifyUserMessage(input: ClarifyInput): string {
  const idea = `Project idea:\n${input.ideaText}`;
  if (input.priorAnswers === null) return idea;
  return `${idea}

Previously asked clarifying questions and the user's answers:
${formatClarifications(input.priorAnswers)}

This is the second and final round. Check whether these answers surface
anything genuinely new that still needs clarification. Unless they do, return
an empty questions array - do not re-ask questions the user skipped, and do
not ask about anything you could have asked in the first round.`;
}

/* Throws a plain Error on shape violations; callLLM wraps it as LLM_BAD_OUTPUT. */
export function parseClarifyOutput(raw: unknown): ClarifyOutput {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("clarify output is not an object");
  }
  const questions = (raw as Record<string, unknown>).questions;
  if (!Array.isArray(questions)) {
    throw new Error("clarify output: questions must be an array");
  }
  const parsed = questions.map((q: unknown) => {
    if (typeof q !== "object" || q === null) {
      throw new Error("clarify output: each question must be an object");
    }
    const { question, whyItMatters } = q as Record<string, unknown>;
    if (typeof question !== "string" || question.length === 0) {
      throw new Error("clarify output: question must be a non-empty string");
    }
    if (typeof whyItMatters !== "string" || whyItMatters.length === 0) {
      throw new Error("clarify output: whyItMatters must be a non-empty string");
    }
    return { question, whyItMatters };
  });
  return { questions: parsed.slice(0, MAX_QUESTIONS) };
}
