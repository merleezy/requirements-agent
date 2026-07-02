import type { FlagNature, RubricDimension } from "../types.ts";

/*
 * Critic agent (spec pipeline stage 3): one requirement -> the single most
 * fundamental rubric failure, or a pass. Called once per requirement; the
 * one-flag-per-pass rule is load-bearing (see the rubric section of the
 * spec) and is structural here - the output is a single flag object.
 *
 * The prompt below is verbatim from docs/agent-prompts.md ("3. Critic
 * agent", incl. the 2026-07-01 revisions) - do not edit it here without
 * flagging the change first, per CLAUDE.md. This file owns the stage's
 * typed input/output, the user message, and validation/normalization of the
 * model's reply; callLLM owns the transport.
 */

export const criticPrompt = `You are the critic agent in a requirements-gathering tool. You check ONE functional
requirement against a fixed rubric and return the SINGLE most fundamental problem
with it, if any. You do not draft, you do not rewrite the whole PRD, and you do not
evaluate more than the one requirement you're given.

Check the requirement against these dimensions, IN THIS ORDER. Stop and return the
first one that fails — do not report multiple failures at once, even if you notice
more than one problem.

1. unambiguous — Does this admit only one reasonable interpretation? Could two
   people implementing this reasonably build different things from it?
2. atomic — Is this exactly one behavior? Or does it bundle multiple distinct
   actions (often signaled by "and," lists, or multiple verbs)?
3. testable — Does this have a concrete pass/fail condition? Could you write a
   test for it as written? Vague quality words ("fast," "easy," "intuitive")
   without a concrete condition fail this.
4. scoped — Does this plausibly belong given the project's stated goals, or does
   it look like an invented addition not grounded in the original idea? (This is
   a judgment call, not a defect — the requirement may be fine, just unconfirmed.)
5. traceable — Does this connect to a stated goal or user need? (Also a judgment
   call — the requirement may be fine, the goal may just need to be added.)

Classify which dimension failed as either:
- "defect" (dimensions 1-3): something is actually wrong with how the requirement
  is written.
- "judgment" (dimensions 4-5): nothing is wrong with the requirement itself, you
  are only flagging it so the user can confirm intent.

For defect dimensions, propose a suggestedRewrite ONLY if you are not guessing at
resolved ambiguity:
- testable failures: propose a concrete rewrite. This is safe — you're adding
  precision, not deciding what the feature means.
- atomic failures: propose a split into separate requirement texts. Put each
  resulting requirement on its own line in suggestedRewrite (plain lines, no
  numbering or bullets).
- unambiguous failures: do NOT propose a confident rewrite. If you can suggest
  one, it must be explicitly conditioned on a stated assumption (fill the
  "assumption" field) — never silently pick an interpretation.

For judgment dimensions, never propose a rewrite. suggestedRewrite must be null.

If the requirement passes all five dimensions, return passed: true and leave the
other fields null/empty.

Output ONLY this JSON shape, with no other text and no markdown code fences:
{
  "requirementId": string,
  "passed": boolean,
  "dimension": "unambiguous" | "atomic" | "testable" | "scoped" | "traceable" | null,
  "nature": "defect" | "judgment" | null,
  "reason": string | null,
  "suggestedRewrite": string | null,
  "assumption": string | null
}`;

export interface CriticInput {
  requirement: { id: string; text: string };
  /* Context for the scoped/traceable dimensions (prompt revision
   * 2026-07-01: the user message must include the original idea). */
  ideaText: string;
  problemStatement: string;
  goals: string[];
}

/* What the model returns, validated and normalized. The requirementId the
 * model echoes back is untrusted - the route pairs each output with the
 * requirement it asked about. */
export interface CriticOutput {
  passed: boolean;
  dimension: RubricDimension | null;
  nature: FlagNature | null;
  reason: string | null;
  suggestedRewrite: string | null;
  assumption: string | null;
}

/* The prompt's "[USER MESSAGE: the single requirement text, plus
 * surrounding context — the original idea, the problem statement, and the
 * goals]". The id is included so the model can echo it. */
export function buildCriticUserMessage(input: CriticInput): string {
  const goals =
    input.goals.length === 0
      ? "(none stated)"
      : input.goals.map((g) => `- ${g}`).join("\n");
  return `Requirement to check (id: ${input.requirement.id}):
${input.requirement.text}

Context - the original idea:
${input.ideaText}

Context - the PRD's problem statement:
${input.problemStatement}

Context - the PRD's goals:
${goals}`;
}

/* The rubric's fixed dimension -> nature mapping (spec: dimensions 1-3 are
 * defects, 4-5 are judgment calls). Derived here rather than trusted from
 * the model, so a misclassified reply can't produce e.g. a judgment flag
 * with rewrite buttons. */
const NATURE_BY_DIMENSION: Record<RubricDimension, FlagNature> = {
  unambiguous: "defect",
  atomic: "defect",
  testable: "defect",
  scoped: "judgment",
  traceable: "judgment",
};

const DIMENSIONS = Object.keys(NATURE_BY_DIMENSION) as RubricDimension[];

/* Throws a plain Error on shape violations (callLLM wraps it as
 * LLM_BAD_OUTPUT) and normalizes replies that are well-formed but break a
 * rubric rule, rather than failing the whole call:
 * - passed: true  -> every other field is nulled, whatever the model sent.
 * - judgment dimensions -> suggestedRewrite and assumption are nulled
 *   (judgment flags never get an auto-rewrite, per the spec).
 * - atomic/testable -> assumption is nulled (it belongs to unambiguous only).
 * - unambiguous with a rewrite but NO stated assumption -> the rewrite is
 *   dropped, falling back to the prompt's question-first behavior instead
 *   of surfacing a silently-guessed interpretation. */
export function parseCriticOutput(raw: unknown): CriticOutput {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("critic output is not an object");
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.passed !== "boolean") {
    throw new Error("critic output: passed must be a boolean");
  }

  if (o.passed) {
    return {
      passed: true,
      dimension: null,
      nature: null,
      reason: null,
      suggestedRewrite: null,
      assumption: null,
    };
  }

  const dimension = o.dimension;
  if (typeof dimension !== "string" || !DIMENSIONS.includes(dimension as RubricDimension)) {
    throw new Error("critic output: a failed check must name a rubric dimension");
  }
  if (typeof o.reason !== "string" || o.reason.length === 0) {
    throw new Error("critic output: a failed check must give a non-empty reason");
  }
  const nature = NATURE_BY_DIMENSION[dimension as RubricDimension];

  let suggestedRewrite =
    typeof o.suggestedRewrite === "string" && o.suggestedRewrite.length > 0
      ? o.suggestedRewrite
      : null;
  let assumption =
    typeof o.assumption === "string" && o.assumption.length > 0 ? o.assumption : null;

  if (nature === "judgment") {
    suggestedRewrite = null;
    assumption = null;
  } else if (dimension === "unambiguous") {
    if (assumption === null) suggestedRewrite = null;
    if (suggestedRewrite === null) assumption = null;
  } else {
    assumption = null;
  }

  return {
    passed: false,
    dimension: dimension as RubricDimension,
    nature,
    reason: o.reason,
    suggestedRewrite,
    assumption,
  };
}
