import type { Request } from "express";
import { HttpError } from "../errors.ts";
import type { Session, SessionStore } from "../session/store.ts";
import type { ClarificationPair } from "../types.ts";

/*
 * Shared request-precondition helpers. Every route that operates on a
 * session or forwards an LLM call goes through these, so the error codes
 * stay identical across routes. Input-shape validators for fields used by
 * more than one route (ideaText, clarification pairs) live here too.
 */

export const SESSION_HEADER = "x-session-id";

/* The user's OpenRouter key, attached by the client per request only.
 * Read it, use it for the one upstream call, and let it go out of scope -
 * never log it, never write it to the session. */
export const API_KEY_HEADER = "x-openrouter-key";

export function requireSession(store: SessionStore, req: Request): Session {
  const id = req.header(SESSION_HEADER);
  if (!id) {
    throw new HttpError(
      400,
      "SESSION_ID_MISSING",
      `Missing ${SESSION_HEADER} header.`,
    );
  }
  const session = store.get(id);
  if (!session) {
    throw new HttpError(
      404,
      "SESSION_NOT_FOUND",
      "Session does not exist or has expired.",
    );
  }
  return session;
}

export function requireApiKey(req: Request): string {
  const key = req.header(API_KEY_HEADER);
  if (!key) {
    throw new HttpError(
      401,
      "API_KEY_MISSING",
      `Missing ${API_KEY_HEADER} header.`,
    );
  }
  return key;
}

const MAX_IDEA_LENGTH = 20_000;

export function requireIdeaText(body: unknown): string {
  const ideaText = (body as { ideaText?: unknown } | null)?.ideaText;
  if (typeof ideaText !== "string" || ideaText.trim().length === 0) {
    throw new HttpError(
      400,
      "INVALID_INPUT",
      "ideaText must be a non-empty string.",
    );
  }
  if (ideaText.length > MAX_IDEA_LENGTH) {
    throw new HttpError(
      400,
      "INVALID_INPUT",
      `ideaText must be at most ${MAX_IDEA_LENGTH} characters.`,
    );
  }
  return ideaText.trim();
}

/* Bounds are generous versions of what the pipeline can produce: the clarify
 * ceiling is 8 questions per round across 2 rounds, and answers are meant to
 * be one sentence each. */
const MAX_PAIRS = 16;
const MAX_QUESTION_LENGTH = 2_000;
const MAX_ANSWER_LENGTH = 4_000;

/* Validates a clarifications/answers array: [{ question, answer }], paired
 * by question text (the server owns question ids). Blank answers are allowed
 * - they mean the user skipped that question. */
export function requireClarificationPairs(value: unknown): ClarificationPair[] {
  if (
    !Array.isArray(value) ||
    value.length > MAX_PAIRS ||
    value.some(
      (p: unknown) =>
        typeof p !== "object" ||
        p === null ||
        typeof (p as Record<string, unknown>).question !== "string" ||
        ((p as Record<string, unknown>).question as string).trim().length === 0 ||
        ((p as Record<string, unknown>).question as string).length > MAX_QUESTION_LENGTH ||
        typeof (p as Record<string, unknown>).answer !== "string" ||
        ((p as Record<string, unknown>).answer as string).length > MAX_ANSWER_LENGTH,
    )
  ) {
    throw new HttpError(
      400,
      "INVALID_INPUT",
      `Clarification answers must be at most ${MAX_PAIRS} { question, answer } string pairs with non-empty questions.`,
    );
  }
  return (value as { question: string; answer: string }[]).map((p) => ({
    question: p.question,
    answer: p.answer,
  }));
}
