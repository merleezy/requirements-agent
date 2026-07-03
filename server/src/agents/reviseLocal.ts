import type { CriticFlag } from "../types.ts";
import { stripRequirementIdReferences } from "../util/text.ts";

/*
 * Revise agent - local (spec pipeline stage 4): one flagged requirement +
 * the critic's flag + the user's response to it -> a resolved requirement
 * text, or an honest "not enough to go on" instead of a guess.
 *
 * The prompt below is verbatim from docs/agent-prompts.md ("4. Revise agent
 * — local") - do not edit it here without flagging the change first, per
 * CLAUDE.md. This file owns the stage's typed input/output, the user
 * message, and validation of the model's reply; callLLM owns the transport.
 * The route re-runs the critic on whatever this produces - this agent does
 * not self-check (per the prompt).
 */

export const reviseLocalPrompt = `You are the revision agent in a requirements-gathering tool. You are given ONE
requirement, the critic's flag on it, and the user's response to that flag
(an answer to a clarifying question, an accepted assumption, or free-form
feedback from a chat follow-up). Produce an updated requirement text that
resolves the specific flag — do not change anything about the requirement that
the flag didn't raise.

Do not re-evaluate the requirement yourself — that is the critic's job, which
will run again automatically after your revision. Your only job is to produce
the corrected text.

If the user's response doesn't give you enough to resolve the flag confidently,
say so in the "unresolved" field rather than guessing. Exactly one of
revisedText and unresolved must be non-null.

If the flag proposed splitting the requirement and the user agreed, put each
resulting requirement on its own line in revisedText (plain lines, no
numbering or bullets).

If resolving the flag requires adding several qualifying rules (validation,
failure handling, edge cases), split instead of stacking clauses: put each
independently testable behavior on its own line in revisedText, rather than
growing one sentence with parentheticals and provisos.

The PRD's open questions are provided as read-only context. Do not write
requirement text that presupposes an answer to any of them - a document must
not defer a decision and encode it at the same time. If the flag cannot be
resolved without deciding one of those questions, return unresolved and name
the decision that is needed.

Requirement text must stand alone. Never reference another requirement by id
or number ("per FR-2", "see REQ-003") - ids are system-owned and unstable
across edits. If one behavior depends on another, restate the dependency in
words.

Ensure that you preserve the exact spelling, capitalization, and spacing of the original requirement text, except for the parts you are intentionally correcting to resolve the flag. Do not concatenate words or strip necessary spaces.

Output ONLY this JSON shape, with no other text and no markdown code fences:
{
  "requirementId": string,
  "revisedText": string | null,
  "unresolved": string | null
}`;

export interface ReviseLocalInput {
  requirement: { id: string; text: string };
  flag: CriticFlag;
  /* The user's freeform feedback on the flag. Accepting the critic's own
   * suggestedRewrite verbatim doesn't need this agent at all - the route
   * applies that text directly (see routes/reviseLocal.ts). */
  response: string;
  /* The PRD's open questions, as read-only context: the prompt forbids
   * rewrites that presuppose an answer to one (the REQ-011-assumes-Q4
   * failure mode - a lone requirement rewrite can't know a decision was
   * deliberately deferred without seeing the list). */
  openQuestions: string[];
}

export interface ReviseLocalOutput {
  revisedText: string | null;
  unresolved: string | null;
}

/* The prompt's "[USER MESSAGE: original requirement text, the critic flag
 * object, and the user's response]". */
export function buildReviseLocalUserMessage(input: ReviseLocalInput): string {
  const { requirement, flag, response, openQuestions } = input;
  const questions =
    openQuestions.length === 0
      ? "(none)"
      : openQuestions.map((q) => `- ${q}`).join("\n");
  return `Requirement (id: ${requirement.id}):
${requirement.text}

Critic's flag:
- dimension: ${flag.dimension}
- nature: ${flag.nature}
- reason: ${flag.reason}
- suggestedRewrite: ${flag.suggestedRewrite ?? "(none)"}
- assumption: ${flag.assumption ?? "(none)"}

The PRD's open questions (read-only context - do not presuppose answers):
${questions}

User's response to this flag:
${response}`;
}

/* Throws a plain Error on shape violations; callLLM wraps it as
 * LLM_BAD_OUTPUT. Enforces the prompt's "exactly one of revisedText and
 * unresolved must be non-null" rule structurally, rather than trusting the
 * model to have honored it. */
export function parseReviseLocalOutput(raw: unknown): ReviseLocalOutput {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("revise-local output is not an object");
  }
  const o = raw as Record<string, unknown>;
  /* Id citations are stripped like every other model-produced requirement
   * text; newlines survive so atomic splits still split downstream. */
  const revisedText =
    typeof o.revisedText === "string" &&
    stripRequirementIdReferences(o.revisedText).length > 0
      ? stripRequirementIdReferences(o.revisedText)
      : null;
  const unresolved =
    typeof o.unresolved === "string" && o.unresolved.trim().length > 0
      ? o.unresolved
      : null;

  if (revisedText === null && unresolved === null) {
    throw new Error(
      "revise-local output: exactly one of revisedText/unresolved must be non-null, got neither",
    );
  }
  if (revisedText !== null && unresolved !== null) {
    throw new Error(
      "revise-local output: exactly one of revisedText/unresolved must be non-null, got both",
    );
  }
  return { revisedText, unresolved };
}
