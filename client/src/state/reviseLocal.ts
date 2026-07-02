import type { PrdItem, Requirement } from "../types";
import { api } from "./api";
import { toClientOutOfScope, toClientRequirements, type ServerRequirement } from "./prdMapping";
import { bootstrapSession } from "./session";

/*
 * The local per-requirement revise loop (spec pipeline stage 4), pulled
 * forward to close a step-7 gap (see CLAUDE.md "Current stage"). One call
 * resolves exactly one flagged requirement:
 *  - a defect flag, by applying the critic's own suggestedRewrite verbatim
 *    or by sending freeform feedback through the revise-local agent
 *  - a judgment flag, by confirming intent or moving it out of scope
 *
 * Every path is now a server round trip, including the two judgment
 * actions, which previously only updated local state. That was a real bug:
 * the session's own copy still showed the requirement as flagged, so the
 * next unrelated revise-local call (which always returns the full
 * requirements array) silently reverted the confirmation back to flagged.
 * Persisting every outcome server-side means the response is always safe
 * to apply wholesale on the client - no partial-merge logic needed.
 */

interface ReviseLocalResponse {
  state: { prd: { functionalRequirements: ServerRequirement[]; outOfScope: string[] } };
  requirementId: string;
  resolved: boolean;
  /* Set only when the agent couldn't resolve the flag from freeform
   * feedback (the "unresolved" field) - the requirement is untouched. */
  message: string | null;
  failures: { requirementId: string; code: string; message: string }[];
}

export interface ReviseLocalResult {
  requirements: Requirement[]; /* the full, possibly-split-longer array */
  outOfScope: PrdItem[]; /* the full array; only changes on a scope move */
  resolved: boolean;
  message: string | null;
}

async function reviseLocal(body: Record<string, unknown>, apiKey: string): Promise<ReviseLocalResult> {
  const { sessionId } = await bootstrapSession();
  const res = await api<ReviseLocalResponse>("/revise-local", {
    method: "POST",
    sessionId,
    apiKey,
    body,
  });
  return {
    requirements: toClientRequirements(res.state.prd.functionalRequirements),
    outOfScope: toClientOutOfScope(res.state.prd.outOfScope),
    resolved: res.resolved,
    message: res.message,
  };
}

/* "Accept rewrite" - applies the critic's own suggestion as-is. */
export function acceptSuggestedRewrite(
  requirementId: string,
  apiKey: string,
): Promise<ReviseLocalResult> {
  return reviseLocal({ requirementId, acceptSuggestedRewrite: true }, apiKey);
}

/* "That's not quite it" - freeform feedback through the revise-local agent. */
export function submitRevisionFeedback(
  requirementId: string,
  response: string,
  apiKey: string,
): Promise<ReviseLocalResult> {
  return reviseLocal({ requirementId, response }, apiKey);
}

/* "Accept as-is anyway" - confirms a judgment flag; no LLM call. */
export function confirmJudgment(requirementId: string, apiKey: string): Promise<ReviseLocalResult> {
  return reviseLocal({ requirementId, confirmJudgment: true }, apiKey);
}

/* "Move to Out of Scope" - resolves a judgment flag by removing the
 * requirement; no LLM call. */
export function moveRequirementToOutOfScope(
  requirementId: string,
  apiKey: string,
): Promise<ReviseLocalResult> {
  return reviseLocal({ requirementId, moveToOutOfScope: true }, apiKey);
}
