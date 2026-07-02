import { api } from "./api";
import { bootstrapSession } from "./session";

/*
 * Step 6: the clarify calls (idea -> questions), prepended to the draft.
 * The server assigns question ids and enforces the 2-round cap; the client
 * drives the flow and owns the answers, sending them back paired with
 * question TEXT (not ids) - a blank answer means the user skipped that
 * question, and agents render it as "(no answer provided)".
 */

export interface ClarifyQuestion {
  id: string; /* server-assigned, "CQ-1"... */
  question: string;
  whyItMatters: string;
  round: number;
}

export interface ClarificationPair {
  question: string;
  answer: string;
}

interface ClarifyResponse {
  questions: ClarifyQuestion[];
}

/* Round 1: fresh idea -> the first batch of questions (possibly none). */
export async function startClarify(
  ideaText: string,
  apiKey: string,
): Promise<ClarifyQuestion[]> {
  const { sessionId } = await bootstrapSession();
  const res = await api<ClarifyResponse>("/clarify", {
    method: "POST",
    sessionId,
    apiKey,
    body: { ideaText },
  });
  return res.questions;
}

/* Round 2: the round-1 answers -> follow-up questions (usually none). */
export async function continueClarify(
  answers: ClarificationPair[],
  apiKey: string,
): Promise<ClarifyQuestion[]> {
  const { sessionId } = await bootstrapSession();
  const res = await api<ClarifyResponse>("/clarify", {
    method: "POST",
    sessionId,
    apiKey,
    body: { answers },
  });
  return res.questions;
}
