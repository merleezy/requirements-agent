import type { PRD } from "../types";
import { api } from "./api";
import type { ClarificationPair } from "./clarify";
import { toClientPrd, type ServerPrd, type ServerProject } from "./prdMapping";
import { bootstrapSession } from "./session";

/*
 * Step 5: the draft call (idea -> PRD). The wire-to-UI mapping now lives in
 * state/prdMapping.ts, shared with the local and global revise loops.
 */

interface DraftResponse {
  sessionId: string;
  project: ServerProject;
  prd: ServerPrd;
}

export async function startDraft(
  ideaText: string,
  clarifications: ClarificationPair[],
  apiKey: string,
): Promise<PRD> {
  const { sessionId } = await bootstrapSession();
  const state = await api<DraftResponse>("/draft", {
    method: "POST",
    sessionId,
    apiKey,
    body: { ideaText, clarifications },
  });
  return toClientPrd(state.project, state.prd);
}
