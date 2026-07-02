import type { Request } from "express";
import { HttpError } from "../errors.ts";
import type { Session, SessionStore } from "../session/store.ts";

/*
 * Shared request-precondition helpers. Every route that operates on a
 * session or forwards an LLM call goes through these, so the error codes
 * stay identical across routes.
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
