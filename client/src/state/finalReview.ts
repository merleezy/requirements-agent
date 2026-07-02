import { api } from "./api";
import type { FinalReviewResult } from "../components/FinalReviewModal";

/* A finding from an earlier review round, sent back on re-runs so the
 * reviewer verifies fixes and converges instead of minting fresh nitpicks
 * every pass. Mirrors the server's PreviousFinding shape. */
export interface PreviousFindingPayload {
  severity: "high" | "medium" | "low";
  category: string;
  location: string;
  explanation: string;
  disposition: "fix_applied" | "not_addressed";
}

export async function runFinalReview(
  apiKey: string,
  previousFindings?: PreviousFindingPayload[],
  signal?: AbortSignal,
): Promise<FinalReviewResult> {
  const sessionId = sessionStorage.getItem("ra.sessionId") ?? undefined;
  return api<FinalReviewResult>("/final-review", {
    method: "POST",
    sessionId,
    apiKey,
    signal,
    body:
      previousFindings && previousFindings.length > 0
        ? { previousFindings }
        : undefined,
  });
}
