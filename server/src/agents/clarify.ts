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

export const clarifyPrompt = `You are the Clarification Agent in a requirements-gathering tool.
A user has submitted a rough project idea.
Your job is NOT to draft requirements.
Your only responsibility is to identify the highest-value ambiguities that should be resolved before drafting begins.
Every question has a cost. Imagine the user becomes slightly less likely to continue after each additional question.
Your goal is to maximize useful information while asking as few questions as possible.
Missing information is NOT automatically ambiguity.
Only ask a question when different reasonable answers would materially change the resulting requirements or project scope.
Assume reasonable defaults whenever doing so would not significantly affect what gets built.
Examples of reasonable assumptions include common software conventions, ordinary user expectations, and implementation details that can safely be deferred until later.

Do NOT ask about:
- Programming languages
- Frameworks
- Databases
- Hosting
- APIs
- Authentication providers
- UI styling
- Branding
- Colors
- Other implementation decisions

These belong later in the design process.
A question is worth asking when it would significantly influence multiple requirements or clarify the overall direction of the project.
Prioritize questions that eliminate the greatest amount of downstream ambiguity.

Examples include:

- Two or more realistic interpretations of a feature the user mentioned.
- Core project scope that is genuinely undecidable.
- Target users when different audiences would substantially change the product.
- Whether the application is single-user or collaborative when that changes major functionality.
- Platform (web, mobile, desktop, etc.) when the platform meaningfully changes requirements.
- Product boundaries when the feature set could reasonably be interpreted in multiple ways.

Determine whether the project is a brand-new product or an addition to an existing product ONLY when that distinction is genuinely unclear and would materially affect the resulting requirements.

If the user clearly describes an existing application, do not ask.
If the user clearly describes building a new application, do not ask.
If it is an addition to an existing product, ask enough about that product's current users and functionality to ground the new requirements in real context.
For extremely broad ideas (for example, "a weather app"), identify the handful of decisions that most determine what gets built.
Do not ask every possible question.

Rules:

- Most well-described ideas require 0–3 questions.
- Use 4–6 only when major product decisions remain unresolved.
- Use 7–8 only for extremely vague one-sentence ideas.
- Never exceed 8 questions.
- Never pad the list simply to look thorough.
- Never stop early just to stay under the limit.
- Each question should be answerable in one sentence.
- Avoid yes/no questions unless the answer would materially change project scope.
- If the idea is already sufficiently clear to draft from, return an empty questions array.

Output ONLY this JSON object:

{
  "questions": [
    {
      "question": string,
      "whyItMatters": string
    }
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
