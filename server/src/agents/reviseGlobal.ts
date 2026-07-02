/*
 * Revise agent - global (spec pipeline stage 5): the whole current PRD +
 * the user's free-form feedback on the document as a whole -> a diff
 * (changed/new/removed requirements plus full-replacement section changes),
 * never a full rewrite. The route applies the diff to the session PRD and
 * re-runs the critic on whatever it touched (in the background, per the
 * revise-local decision).
 *
 * The prompt below is verbatim from docs/agent-prompts.md ("5. Revise agent
 * — global") - do not edit it here without flagging the change first, per
 * CLAUDE.md. The trailing "[USER MESSAGE: ...]" line is a placeholder
 * describing the user message, not system-prompt content, so it is excluded
 * (matching the other agent files); the "NOTE: every requirement..."
 * paragraph after it is addressed to the model and IS part of the prompt.
 * This file owns the stage's typed input/output, the user message, and
 * validation of the model's reply; callLLM owns the transport.
 */

export const reviseGlobalPrompt = `You are the revision agent handling general feedback on a full PRD, not scoped to
one requirement. The user has given feedback about the document as a whole — e.g.
a missing requirement, a change in priorities, or a re-scoping note.

You receive the entire current PRD (all sections) and the user's feedback. Produce
a diff: only the sections/requirements that should change or be added, not a
full rewrite of the document. Do not touch anything the feedback didn't address.

For any NEW requirements you add, follow the same rules the draft agent follows:
one behavior each, don't invent unstated specifics, don't add anything not
grounded in the idea/goals/feedback given.

Output ONLY this JSON shape, with no other text and no markdown code fences:
{
  "changedRequirements": [{ "id": string, "revisedText": string }],
  "newRequirements": [{ "text": string }],
  "removedRequirementIds": [string],
  "otherSectionChanges": {
    "problemStatement": string | null,
    "targetUsers": [string] | null,
    "goals": [string] | null,
    "outOfScope": [string] | null,
    "openQuestions": [string] | null
  }
}

Every field in otherSectionChanges should be null unless the feedback specifically
warrants changing that section. A non-null field is the COMPLETE new content for
that section - a full replacement, not just the added or changed lines. The three
requirement arrays, by contrast, list only what actually changed.

NOTE: every requirement in changedRequirements and newRequirements gets
automatically re-run through the critic after this call — you do not need to
self-check them.`;

/* The current PRD as the model sees it: requirements are id + text only, no
 * status/flag/acceptedAsIs noise (the model only needs to target ids and read
 * text). The section fields mirror the server PRD shape minus internal ones. */
export interface ReviseGlobalPrd {
  problemStatement: string;
  targetUsers: string[];
  goals: string[];
  functionalRequirements: { id: string; text: string }[];
  outOfScope: string[];
  openQuestions: string[];
}

export interface ReviseGlobalInput {
  /* The original idea grounds the prompt's "don't add anything not grounded in
   * the idea/goals/feedback" rule - same rationale as the critic getting it. */
  ideaText: string;
  title: string;
  prd: ReviseGlobalPrd;
  feedback: string;
  /* Non-null when the feedback was left as a comment on a specific part of the
   * document (a requirement or a section item), so the model knows what the
   * comment is anchored to. Null for whole-PRD chat feedback. */
  target: { id: string; description: string; text: string } | null;
}

export interface ReviseGlobalOutput {
  changedRequirements: { id: string; revisedText: string }[];
  newRequirements: { text: string }[];
  removedRequirementIds: string[];
  otherSectionChanges: {
    problemStatement: string | null;
    targetUsers: string[] | null;
    goals: string[] | null;
    outOfScope: string[] | null;
    openQuestions: string[] | null;
  };
}

/* The prompt's "[USER MESSAGE: full current PRD JSON + user's general feedback
 * text]". The PRD is rendered as JSON (title + all sections, requirements as
 * { id, text }) so the model can target requirements by their server-assigned
 * ids; the original idea and the feedback follow. */
export function buildReviseGlobalUserMessage(input: ReviseGlobalInput): string {
  const { ideaText, title, prd, feedback, target } = input;
  const prdJson = JSON.stringify(
    {
      title,
      problemStatement: prd.problemStatement,
      targetUsers: prd.targetUsers,
      goals: prd.goals,
      functionalRequirements: prd.functionalRequirements.map((r) => ({
        id: r.id,
        text: r.text,
      })),
      outOfScope: prd.outOfScope,
      openQuestions: prd.openQuestions,
    },
    null,
    2,
  );

  const targetLine = target
    ? `\nThis feedback was left as a comment on ${target.description}: "${target.text}"\n`
    : "";

  return `Current PRD:
${prdJson}

The original idea this PRD was drafted from:
${ideaText}
${targetLine}
User's feedback on the document:
${feedback}`;
}

/* Validates the prompt's output shape, throwing a plain Error on wrong types
 * (callLLM wraps it as LLM_BAD_OUTPUT), matching the other parsers:
 * - changedRequirements: { id, revisedText } with both non-empty (texts trimmed)
 * - newRequirements: { text } non-empty (trimmed)
 * - removedRequirementIds: non-empty strings
 * - otherSectionChanges: each key is string|null (problemStatement) or
 *   string[]|null; a missing key or a missing object normalizes to null. An
 *   empty array is valid - full-replacement semantics make it "clear the
 *   section". Extra fields anywhere are ignored. */
export function parseReviseGlobalOutput(raw: unknown): ReviseGlobalOutput {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("revise-global output is not an object");
  }
  const o = raw as Record<string, unknown>;

  const changedRequirements = parseChangedRequirements(o.changedRequirements);
  const newRequirements = parseNewRequirements(o.newRequirements);
  const removedRequirementIds = parseRemovedIds(o.removedRequirementIds);
  const otherSectionChanges = parseOtherSectionChanges(o.otherSectionChanges);

  return {
    changedRequirements,
    newRequirements,
    removedRequirementIds,
    otherSectionChanges,
  };
}

function parseChangedRequirements(
  value: unknown,
): { id: string; revisedText: string }[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error("revise-global output: changedRequirements must be an array");
  }
  const results: { id: string; revisedText: string }[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const id = typeof e.id === "string" ? e.id.trim() : "";
    const revisedText = typeof e.revisedText === "string" ? e.revisedText.trim() : "";
    /* Skip entries the model emitted with blank id or text rather than
     * failing the entire pass - a hallucinated or partial entry should not
     * prevent an otherwise-valid diff from being applied. */
    if (id.length === 0 || revisedText.length === 0) continue;
    results.push({ id, revisedText });
  }
  return results;
}

function parseNewRequirements(value: unknown): { text: string }[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error("revise-global output: newRequirements must be an array");
  }
  return value.map((entry) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error("revise-global output: each newRequirement must be an object");
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.text !== "string" || e.text.trim().length === 0) {
      throw new Error("revise-global output: newRequirement.text must be a non-empty string");
    }
    return { text: e.text.trim() };
  });
}

function parseRemovedIds(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error("revise-global output: removedRequirementIds must be an array");
  }
  return value.map((id) => {
    if (typeof id !== "string" || id.trim().length === 0) {
      throw new Error(
        "revise-global output: each removedRequirementId must be a non-empty string",
      );
    }
    return id.trim();
  });
}

function parseOtherSectionChanges(
  value: unknown,
): ReviseGlobalOutput["otherSectionChanges"] {
  const empty = {
    problemStatement: null,
    targetUsers: null,
    goals: null,
    outOfScope: null,
    openQuestions: null,
  } satisfies ReviseGlobalOutput["otherSectionChanges"];

  if (value === undefined || value === null) return empty;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("revise-global output: otherSectionChanges must be an object");
  }
  const o = value as Record<string, unknown>;
  return {
    problemStatement: parseNullableString(o.problemStatement, "problemStatement"),
    targetUsers: parseNullableStringArray(o.targetUsers, "targetUsers"),
    goals: parseNullableStringArray(o.goals, "goals"),
    outOfScope: parseNullableStringArray(o.outOfScope, "outOfScope"),
    openQuestions: parseNullableStringArray(o.openQuestions, "openQuestions"),
  };
}

function parseNullableString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`revise-global output: otherSectionChanges.${field} must be a string or null`);
  }
  return value;
}

/* An empty array is valid and distinct from null: full-replacement semantics
 * make [] "clear this section", while null means "leave it untouched". */
function parseNullableStringArray(value: unknown, field: string): string[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) {
    throw new Error(
      `revise-global output: otherSectionChanges.${field} must be an array of strings or null`,
    );
  }
  return value.map((item) => {
    if (typeof item !== "string") {
      throw new Error(
        `revise-global output: otherSectionChanges.${field} must contain only strings`,
      );
    }
    return item.trim();
  });
}
