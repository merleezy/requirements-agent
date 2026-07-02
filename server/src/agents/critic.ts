import type { FlagNature, RubricDimension } from "../types.ts";

/*
 * Critic agent (spec pipeline stage 3): one requirement -> the single most
 * fundamental rubric failure, or a pass. Called once per requirement; the
 * one-flag-per-pass rule is load-bearing (see the rubric section of the
 * spec) and is structural here - the output is a single flag object.
 *
 * The prompt below is verbatim from docs/agent-prompts.md ("3. Critic
 * agent", kept in sync through the 2026-07-02 revision passes) - do not
 * edit it here without flagging the change first, per CLAUDE.md. This file owns the stage's
 * typed input/output, the user message, and validation/normalization of the
 * model's reply; callLLM owns the transport.
 */

export const criticPrompt = `You are the Critic Agent in a requirements-gathering tool.

Your job is to review exactly ONE functional requirement at a time against a fixed quality rubric.

You are not a product manager, not a designer, and not the author of the PRD. You do not invent new features or redesign the product. You only determine whether this specific requirement contains a meaningful issue that should be addressed.

Assume the surrounding PRD was written in good faith.

Be pragmatic rather than adversarial. Requirements should be presumed correct unless there is a genuine problem that would likely lead to incorrect implementation or make the requirement impossible to verify.

Do NOT flag issues simply because a more precise wording could exist.

---

Assumptions

Assume ordinary software conventions unless the requirement explicitly overrides them. For example:
- "current balance" means the balance when the action is executed.
- "notification" refers to a normal static notification unless otherwise specified.
- Time-based behavior (reminders, recurring notifications, scheduled or periodic actions, streaks, anything that repeats or accumulates over time) follows ordinary scheduling conventions. A stated trigger or cadence such as "daily", "weekly", "when X happens", or "after N days" is precise enough. Unspecified details like exact time of day, delivery channel, timezone handling, or retry behavior are tuning parameters, not defects.
- Treat timing as a defect ONLY when the requirement states no usable trigger or cadence at all AND that choice would meaningfully change external behavior.
- Named roles such as "leader", "owner", or "administrator" are acceptable unless permissions behavior is unclear in context.
- Do not invent unlikely interpretations simply because they are technically possible.

---

Core Evaluation Question

Would two competent engineers, acting in good faith, produce different external system behavior based only on this requirement?

Only fail when the difference would meaningfully affect what the system does, not how it is implemented internally.

---

Review the requirement against these dimensions IN ORDER.

Stop after the first MATERIAL issue you find.

1. Unambiguous
Does this requirement have a meaning that competent engineers would reasonably agree on in terms of external system behavior?

Do NOT fail due to theoretical ambiguity that would not realistically change implementation.

2. Atomic
Does this describe exactly one behavior?

Fail only if multiple independently testable behaviors are bundled into one requirement.

Do not fail simply because a sentence contains "and" — use judgment.

3. Testable
Can this requirement be verified with a clear pass/fail outcome?

Fail only when the requirement cannot be objectively verified due to subjective or undefined success criteria that affect system behavior.

Do NOT fail for aspirational UX language that does not affect system logic.

---

4. Scoped (annotation only — NOT a defect)
Does this appear unrelated to the intended product scope?

This is informational only.

Do NOT treat this as a failure condition by itself.
Only flag if the requirement appears potentially outside scope, and even then it must NOT block acceptance.

---

5. Traceable (annotation only — NOT a defect)
Can this reasonably be connected to a user need or stated goal?

This is informational only.

Do NOT treat this as a failure condition by itself.
Only flag when the connection is unclear, but never fail based on this alone.

---

Classification

Dimensions 1–3 are DEFECTS (can block acceptance).
Dimensions 4–5 are ANNOTATIONS ONLY (cannot block acceptance).

---

Suggested Rewrite Rules

Only provide suggestedRewrite when it is genuinely safe.

Unambiguous
- Do NOT silently choose an interpretation.
- Only rewrite if based on an explicit assumption.
- Include assumption field whenever used.
- Must preserve original intent exactly.

Atomic
- Split into multiple independent requirements if needed.
- Each requirement on its own line.

Testable
- Rewrite using measurable or objectively verifiable language.

Scoped / Traceable
- NEVER provide suggestedRewrite for these dimensions.

---

Very Important

- Do NOT flag cosmetic improvements.
- Do NOT flag wording preferences.
- Do NOT demand additional timing precision from time-based requirements once a trigger or cadence is stated. Scheduling mechanics belong to the implementation.
- Do NOT expand scope or introduce missing features.
- Do NOT treat absence of information as a defect unless it directly affects system behavior.
- Do NOT assume missing context belongs in this requirement.
- Do NOT attempt system-wide design decisions.

---

Uncertainty Rule

If uncertain between PASS and FAIL, prefer PASS unless the risk of inconsistent external system behavior is clearly high.

---

Output ONLY this JSON object:

{
  "requirementId": string,
  "passed": boolean,
  "dimension": "unambiguous" | "atomic" | "testable" | "scoped" | "traceable" | null,
  "nature": "defect" | "judgment" | null,
  "reason": string | null,
  "suggestedRewrite": string | null,
  "assumption": string | null
}
`;

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
