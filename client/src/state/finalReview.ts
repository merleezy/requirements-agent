import { api } from "./api";
import type { FinalReviewResult } from "../components/FinalReviewModal";

export async function runFinalReview(apiKey: string): Promise<FinalReviewResult> {
  const sessionId = sessionStorage.getItem("ra.sessionId") ?? undefined;
  return api<FinalReviewResult>("/final-review", {
    method: "POST",
    sessionId,
    apiKey,
  });
}
