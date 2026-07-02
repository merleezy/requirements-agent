import type { PRD, PrdItem, Requirement } from "../types";

/*
 * Shared server -> client mapping, used by every call that returns PRD
 * state: the draft response (state/draft.ts), the local revise loop
 * (state/reviseLocal.ts), and the global revise loop (state/reviseGlobal.ts).
 *
 * The server stores non-requirement sections as plain strings; the client
 * wraps them in PrdItems with deterministic position-based ids so they are
 * commentable and so annotations can name a target the server re-derives the
 * same way (position-based, never random). `ref` is likewise recomputed by
 * array position rather than carried over, so it stays a stable "REQ-00N"
 * display sequence no matter how a split changes the underlying ids.
 */

export interface ServerRequirement {
  id: string;
  text: string;
  status: Requirement["status"];
  flag: Requirement["flag"];
  acceptedAsIs?: boolean;
}

export interface ServerPrd {
  version: number; /* bumped by an applied global revision; draft = 1 */
  summary: string;
  problemStatement: string;
  targetUsers: string[];
  goals: string[];
  functionalRequirements: ServerRequirement[];
  outOfScope: string[];
  openQuestions: string[];
  /* nextRequirementNumber is an internal server counter; ignored here. */
}

export interface ServerProject {
  title: string;
  ideaText: string;
  createdAt: string;
  stage: string;
}

/* The full server-PRD -> client-PRD mapping. `version` renders as
 * "Draft v${version}"; the position-based section-item ids (ps, tu-n, g-n,
 * oos-n, oq-n) match what the server re-derives when annotations name a
 * target. */
export function toClientPrd(project: ServerProject, prd: ServerPrd): PRD {
  return {
    /* Both come from the draft agent itself (prompt revision 2026-07-01). */
    title: project.title,
    subtitle: prd.summary,
    version: `Draft v${prd.version}`,
    problemStatement: { id: "ps", text: prd.problemStatement },
    targetUsers: prd.targetUsers.map((text, i) => ({ id: `tu-${i + 1}`, text })),
    goals: prd.goals.map((text, i) => ({ id: `g-${i + 1}`, text })),
    functionalRequirements: toClientRequirements(prd.functionalRequirements),
    outOfScope: toClientOutOfScope(prd.outOfScope),
    openQuestions: prd.openQuestions.map((text, i) => ({ id: `oq-${i + 1}`, text })),
  };
}

export function toClientRequirements(serverReqs: ServerRequirement[]): Requirement[] {
  return serverReqs.map((r, i) => ({
    id: r.id,
    ref: `REQ-${String(i + 1).padStart(3, "0")}`,
    text: r.text,
    status: r.status,
    flag: r.flag,
    highlight: null,
    acceptedAsIs: r.acceptedAsIs,
  }));
}

/* Same position-based id scheme draft.ts uses for outOfScope - re-derived
 * here so a server-persisted "move to out of scope" (state/reviseLocal.ts)
 * stays consistent with a freshly drafted PRD's ids. */
export function toClientOutOfScope(serverOutOfScope: string[]): PrdItem[] {
  return serverOutOfScope.map((text, i) => ({ id: `oos-${i + 1}`, text }));
}
