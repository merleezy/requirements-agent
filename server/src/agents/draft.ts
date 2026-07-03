/*
 * Draft agent (spec pipeline stage 2): clarified idea -> structured PRD.
 *
 * The prompt below is verbatim from docs/agent-prompts.md ("2. Draft agent")
 * - do not edit it here without flagging the change first, per CLAUDE.md.
 * This file owns the stage's typed input/output, how the input becomes the
 * user message, and validation of the model's JSON reply; callLLM owns the
 * transport.
 */

import type { ClarificationPair } from "../types.ts";
import { stripRequirementIdReferences } from "../util/text.ts";
import { formatClarifications } from "./clarifications.ts";

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
- openQuestions: array of short, concise questions (10-15 words max each) on things
  you could not resolve even with the clarifying answers, and that the user should decide.

Rules for functionalRequirements — this is the section a separate critic will
check line by line, so follow these strictly:
- Each requirement is ONE behavior. If you notice yourself writing "and" to join
  two distinct actions, split it into two requirements instead.
- Keep requirements at a consistent altitude: one sentence per requirement. If a
  behavior needs several qualifying rules (validation, failure handling, edge
  cases), write each independently testable rule as its own requirement rather
  than stacking clauses onto one sentence.
- Each requirement must stand alone. Never reference another requirement by id
  or number ("per FR-2", "see requirement 3") - ids are assigned by the system
  and change as requirements are split or removed. If one behavior depends on
  another, restate the dependency in words.
- A requirement must not presuppose the answer to anything you list in
  openQuestions. If you catch yourself writing one that does, either make the
  decision explicit in the requirement and drop the question, or keep the
  question and write the requirement without the assumption.
- State requirements in terms of current, observable behavior only. Do NOT write design rationale, compliance notes, or speculative future statements (e.g., "if X is introduced in the future, it would be layered on top") in requirement text.
- Validation requirements in the same domain must share consistent failure semantics. If one validation rule specifies explicit failure handling (e.g., "rejects input and displays an error message"), related validation rules must also specify their failure behavior rather than using vague phrasing like "must ensure".
- State requirements in terms of observable behavior, not vague qualities. Prefer
  "returns results within 500ms" over "is fast." If you don't have a concrete
  number or condition, don't invent one — write the requirement as specifically
  as the input actually supports, and let ambiguity surface naturally rather than
  papering over it with a fabricated detail.
- Preserve exact word boundaries, proper spacing, and capitalization. Proofread requirement text to avoid concatenated words (e.g., "meansthe").
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

export interface DraftInput {
  ideaText: string;
  /* The clarify stage's Q&A, paired by question text (blank answer = the
   * user skipped that question). Empty when clarify asked nothing. */
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
      : formatClarifications(input.clarifications);
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
    /* Id citations in requirement text are stripped rather than trusted -
     * see stripRequirementIdReferences. A text that strips to nothing keeps
     * its original form rather than becoming an empty requirement. */
    functionalRequirements: (o.functionalRequirements as { text: string }[]).map(
      (r) => ({ text: stripRequirementIdReferences(r.text) || r.text }),
    ),
    outOfScope: o.outOfScope as string[],
    openQuestions: o.openQuestions as string[],
  };
}
