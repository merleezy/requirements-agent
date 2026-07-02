import type { PRD } from "../types";
import { api } from "./api";
import { toClientPrd, type ServerPrd, type ServerProject } from "./prdMapping";
import { bootstrapSession } from "./session";

/*
 * Step 9: the global revise loop (spec pipeline stage 5, whole-document
 * feedback). One call takes freeform feedback and an optional target - a
 * requirement id ("FR-...", including post-split ids like "FR-2.1") or a
 * section-item id in the client's deterministic scheme (ps, tu-n, g-n,
 * oos-n, oq-n) - and returns the full authoritative PRD state plus a
 * deterministic Draftsmith reply.
 *
 * The server commits the change and reports which requirements changed or
 * were added; the client applies the returned PRD wholesale and then runs
 * the existing background critic over those ids (the server does not critic
 * in this route), exactly like the local revise loop. Applying wholesale is
 * safe because the response is always the cumulative session state.
 */

interface ReviseGlobalResponse {
  state: { project: ServerProject; prd: ServerPrd };
  summary: string; /* Draftsmith's deterministic reply - used verbatim */
  applied: boolean;
  changedRequirementIds: string[]; /* post-split ids reset to draft */
  newRequirementIds: string[];
  removedRequirementIds: string[];
  changedSections: string[];
  annotationId: string | null;
}

export interface ReviseGlobalResult {
  prd: PRD; /* the full, authoritative PRD */
  summary: string;
  applied: boolean;
  /* Changed + new requirement ids, to re-check with the background critic. */
  recheckIds: string[];
  annotationId: string | null;
}

export async function sendGlobalFeedback(
  feedback: string,
  targetId: string | undefined,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ReviseGlobalResult> {
  const { sessionId } = await bootstrapSession();
  const res = await api<ReviseGlobalResponse>("/revise-global", {
    method: "POST",
    sessionId,
    apiKey,
    body: targetId === undefined ? { feedback } : { feedback, targetId },
    signal,
  });
  return {
    prd: toClientPrd(res.state.project, res.state.prd),
    summary: res.summary,
    applied: res.applied,
    recheckIds: [...res.changedRequirementIds, ...res.newRequirementIds],
    annotationId: res.annotationId,
  };
}
