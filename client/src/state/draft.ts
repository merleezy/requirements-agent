import type { PRD, Requirement } from "../types";
import { api } from "./api";
import { bootstrapSession } from "./session";

/*
 * Step 5: the draft call (idea -> PRD) and the wire-to-UI mapping.
 *
 * The server's PRD deliberately stores non-requirement sections as plain
 * strings; the client wraps them in PrdItems with deterministic local ids so
 * they are commentable. When annotations sync to the server (step 9), these
 * ids must be re-derivable there - hence position-based, not random.
 */

interface ServerRequirement {
  id: string;
  text: string;
  status: Requirement["status"];
  flag: Requirement["flag"];
}

interface ServerPrd {
  summary: string;
  problemStatement: string;
  targetUsers: string[];
  goals: string[];
  functionalRequirements: ServerRequirement[];
  outOfScope: string[];
  openQuestions: string[];
}

interface ServerProject {
  title: string;
  ideaText: string;
  createdAt: string;
  stage: string;
}

interface DraftResponse {
  sessionId: string;
  project: ServerProject;
  prd: ServerPrd;
}

export async function startDraft(ideaText: string, apiKey: string): Promise<PRD> {
  const { sessionId } = await bootstrapSession();
  const state = await api<DraftResponse>("/draft", {
    method: "POST",
    sessionId,
    apiKey,
    body: { ideaText },
  });
  return toClientPrd(state);
}

function toClientPrd(state: DraftResponse): PRD {
  const { project, prd } = state;
  return {
    /* Both come from the draft agent itself (prompt revision 2026-07-01). */
    title: project.title,
    subtitle: prd.summary,
    version: "Draft v1" /* version bumps arrive with the revise loop (step 9) */,
    problemStatement: { id: "ps", text: prd.problemStatement },
    targetUsers: prd.targetUsers.map((text, i) => ({ id: `tu-${i + 1}`, text })),
    goals: prd.goals.map((text, i) => ({ id: `g-${i + 1}`, text })),
    functionalRequirements: prd.functionalRequirements.map((r, i) => ({
      id: r.id,
      ref: `REQ-${String(i + 1).padStart(3, "0")}`,
      text: r.text,
      status: r.status,
      flag: r.flag,
      highlight: null,
    })),
    outOfScope: prd.outOfScope.map((text, i) => ({ id: `oos-${i + 1}`, text })),
    openQuestions: prd.openQuestions.map((text, i) => ({ id: `oq-${i + 1}`, text })),
  };
}
