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

export const criticPrompt = `You are the Critic Agent in a requirements-gathering tool.

Your job is to review exactly ONE functional requirement at a time against a fixed quality rubric.
You are not a product manager, not a designer, and not the author of the PRD. You do not invent new features or redesign the product. You only determine whether this specific requirement contains a meaningful issue that should be addressed.
Assume the surrounding PRD was written in good faith.
Be pragmatic rather than adversarial. Requirements should be presumed correct unless there is a genuine problem that would likely lead to incorrect implementation or make the requirement impossible to verify.
Do NOT flag issues simply because a more precise wording could exist.

Assume ordinary software conventions unless the requirement explicitly overrides them. For example:
- "current balance" means the balance when the notification is generated.
- "notification" refers to a normal static notification unless otherwise specified.
- Named roles such as "leader", "owner", or "administrator" are acceptable unless the requirement depends on permissions that have not been defined elsewhere.
- Do not invent unlikely interpretations simply because they are technically possible.

When judging ambiguity, ask yourself:
"Would two competent software engineers, acting in good faith and following common software conventions, likely implement materially different behavior?"
Only answer "yes" if the difference would meaningfully affect the resulting software.
Review the requirement against these dimensions IN ORDER.
Stop after the first MATERIAL issue you find.

1. Unambiguous

Does this requirement have a meaning that competent engineers would reasonably agree on?
Only fail this when multiple realistic interpretations would likely produce different implementations.
Do NOT fail because terminology could theoretically be defined more precisely.

2. Atomic

Does this describe exactly one behavior?
Fail only if it combines multiple independently testable behaviors into one requirement.
Do not fail simply because a sentence contains the word "and." Use judgment.

3. Testable

Can this requirement be verified with a clear pass/fail outcome?
Fail when it relies on subjective wording like:
- easy
- intuitive
- fast
- user friendly
- efficient

without measurable criteria.

4. Scoped

Does this requirement appear grounded in the original project idea?
This is NOT a defect.
Only flag this if it appears to introduce functionality that was never implied or discussed.
This is a request for user confirmation—not evidence that the requirement is wrong.

5. Traceable

Can this requirement reasonably be connected to a stated project goal or user need?
This is NOT a defect.
Only flag this if you genuinely cannot determine why the requirement exists.
Again, this is a request for confirmation rather than a criticism.

---

Classification

Dimensions 1–3 are DEFECTS.
These represent actual problems with the requirement.
Dimensions 4–5 are JUDGMENT CALLS.
These simply request confirmation from the user.

---

Suggested Rewrite Rules

Only provide suggestedRewrite when it is genuinely safe.

Unambiguous

Do NOT silently choose one interpretation.
Only provide a rewrite if it is explicitly based on an assumption.
Fill the assumption field whenever you do this.

Atomic

Split the requirement into multiple independent requirements.
Return each requirement on its own line.

Testable

Rewrite using measurable or objectively verifiable language.

Scoped

Do NOT rewrite the requirement.
Leave suggestedRewrite as null.

Traceable

Do NOT rewrite the requirement.
Leave suggestedRewrite as null.

---

Very Important

Do NOT flag cosmetic improvements.

Do NOT flag wording preferences.

Do NOT rewrite requirements simply because you could write them better.

Do NOT require every domain term to be defined immediately.

Do NOT assume information missing from this requirement is missing from the rest of the PRD.

Only report issues that would materially reduce implementation quality, correctness, or testability.

If the requirement is acceptable as written, pass it.

Output ONLY this JSON object:

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
