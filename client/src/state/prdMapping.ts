import type { PrdItem, Requirement } from "../types";

/*
 * Shared server -> client mapping for the functionalRequirements array,
 * used by both the draft response (state/draft.ts) and any call that
 * returns a fresh requirements array (state/reviseLocal.ts) - most notably
 * an atomic split, which changes the array's length and ids. `ref` is
 * always recomputed by array position rather than carried over, so it
 * stays a stable "REQ-00N" display sequence no matter how ids change.
 */

export interface ServerRequirement {
  id: string;
  text: string;
  status: Requirement["status"];
  flag: Requirement["flag"];
  acceptedAsIs?: boolean;
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
