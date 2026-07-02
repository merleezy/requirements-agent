/*
 * Draft agent (spec pipeline stage 2): clarified idea -> structured PRD.
 *
 * The prompt below is verbatim from docs/agent-prompts.md ("2. Draft agent")
 * - do not edit it here without flagging the change first, per CLAUDE.md.
 * This file owns the stage's typed input/output, how the input becomes the
 * user message, and validation of the model's JSON reply; callLLM owns the
 * transport.
 */

export const draftPrompt = `You are the drafting agent in a requirements-gathering tool. You turn a clarified
project idea into a structured PRD. You write for precision, not persuasion — this
document will be checked line-by-line by a separate critic agent, so favor being
concrete over sounding polished.

Input you will receive: the original idea, plus the clarifying questions and the
user's answers (if any).

Produce a PRD with exactly these fields:
- title: a short name for the product or feature (3-8 words, plain noun phrase,
  no marketing language).
- summary: one sentence stating what the product does and for whom - this is
  the document's subtitle.
- problemStatement: 1-3 sentences. What problem, for whom.
- targetUsers: array of short user descriptions.
- goals: array of goal statements (outcomes, not features).
- functionalRequirements: array of individual requirement objects (see shape below).
- outOfScope: array of short statements — things this project explicitly will NOT do.
- openQuestions: array of things you could not resolve even with the clarifying
  answers, and that the user should decide.

Rules for functionalRequirements — this is the section a separate critic will
check line by line, so follow these strictly:
- Each requirement is ONE behavior. If you notice yourself writing "and" to join
  two distinct actions, split it into two requirements instead.
- State requirements in terms of observable behavior, not vague qualities. Prefer
  "returns results within 500ms" over "is fast." If you don't have a concrete
  number or condition, don't invent one — write the requirement as specifically
  as the input actually supports, and let ambiguity surface naturally rather than
  papering over it with a fabricated detail.
- Do not silently resolve ambiguity left over from the clarifying stage. If the
  input still leaves something genuinely unclear, write the requirement as best
  you can but do not invent unstated specifics to make it sound complete.
- Only include a requirement if it traces back to something in the idea, the
  clarifying answers, or the stated goals. Don't add capabilities "because most
  apps like this would have them" — flag such ideas in openQuestions instead if
  you think they're worth considering, but don't draft them as requirements.

Requirement object shape:
{ "text": string }

Output ONLY this JSON shape, with no other text and no markdown code fences:
{
  "title": string,
  "summary": string,
  "problemStatement": string,
  "targetUsers": [string],
  "goals": [string],
  "functionalRequirements": [{ "text": string }],
  "outOfScope": [string],
  "openQuestions": [string]
}`;

export interface ClarificationPair {
  question: string;
  answer: string;
}

export interface DraftInput {
  ideaText: string;
  /* Empty until the clarify agent lands (build-order step 6). */
  clarifications: ClarificationPair[];
}

/* What the model returns, validated. The model mints no ids (prompt revision
 * 2026-07-01) - the server assigns stable requirement ids itself. */
export interface DraftOutput {
  title: string;
  summary: string;
  problemStatement: string;
  targetUsers: string[];
  goals: string[];
  functionalRequirements: { text: string }[];
  outOfScope: string[];
  openQuestions: string[];
}

/* The prompt's "[USER MESSAGE: original idea + clarifying Q&A pairs]". */
export function buildDraftUserMessage(input: DraftInput): string {
  const qa =
    input.clarifications.length === 0
      ? "(none)"
      : input.clarifications
          .map((c) => `Q: ${c.question}\nA: ${c.answer}`)
          .join("\n\n");
  return `Project idea:\n${input.ideaText}\n\nClarifying questions and answers:\n${qa}`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/* Throws a plain Error on shape violations; callLLM wraps it as LLM_BAD_OUTPUT. */
export function parseDraftOutput(raw: unknown): DraftOutput {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("draft output is not an object");
  }
  const o = raw as Record<string, unknown>;
  for (const key of ["title", "summary", "problemStatement"] as const) {
    if (typeof o[key] !== "string" || o[key].length === 0) {
      throw new Error(`draft output: ${key} must be a non-empty string`);
    }
  }
  for (const key of ["targetUsers", "goals", "outOfScope", "openQuestions"] as const) {
    if (!isStringArray(o[key])) {
      throw new Error(`draft output: ${key} must be an array of strings`);
    }
  }
  if (
    !Array.isArray(o.functionalRequirements) ||
    o.functionalRequirements.some(
      (r: unknown) =>
        typeof r !== "object" ||
        r === null ||
        typeof (r as Record<string, unknown>).text !== "string" ||
        ((r as Record<string, unknown>).text as string).length === 0,
    )
  ) {
    throw new Error(
      "draft output: functionalRequirements must be objects with non-empty text",
    );
  }
  if (o.functionalRequirements.length === 0) {
    throw new Error("draft output: functionalRequirements is empty");
  }
  return {
    title: o.title as string,
    summary: o.summary as string,
    problemStatement: o.problemStatement as string,
    targetUsers: o.targetUsers as string[],
    goals: o.goals as string[],
    functionalRequirements: (o.functionalRequirements as { text: string }[]).map(
      (r) => ({ text: r.text }),
    ),
    outOfScope: o.outOfScope as string[],
    openQuestions: o.openQuestions as string[],
  };
}
