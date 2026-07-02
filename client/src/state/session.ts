import { useEffect, useState } from "react";
import { api, ApiError } from "./api";

/*
 * Client session state (spec: /client/state).
 *
 * Two independent pieces live in sessionStorage - NOT localStorage, so both
 * reliably clear when the tab closes (the tab is the session boundary):
 *  - the server session id, replayed in the x-session-id header
 *  - the user's OpenRouter API key, which is read from here and attached
 *    per request only; it is never sent to or stored by our server
 */

const SESSION_ID_KEY = "ra.sessionId";
const API_KEY_KEY = "ra.openrouterKey";

/* Mirrors the server's SessionState (server/src/session/store.ts). project
 * and prd stay loosely typed until step 5 fixes the wire shape - the
 * document view still runs on local sample data at this step. */
export interface ServerSessionState {
  sessionId: string;
  createdAt: string;
  project: unknown | null;
  prd: unknown | null;
  annotations: unknown[];
  agentRuns: unknown[];
  modelConfig: Record<string, { model: string }>;
}

async function bootstrap(): Promise<ServerSessionState> {
  const stored = sessionStorage.getItem(SESSION_ID_KEY);
  if (stored) {
    try {
      return await api<ServerSessionState>("/session", { sessionId: stored });
    } catch (err) {
      /* 404 = expired or unknown id; fall through and start fresh */
      if (!(err instanceof ApiError && err.status === 404)) throw err;
    }
  }
  const created = await api<ServerSessionState>("/session", { method: "POST" });
  sessionStorage.setItem(SESSION_ID_KEY, created.sessionId);
  return created;
}

/* Memoized so StrictMode's double effect (and any future second caller)
 * can't create two server sessions for one tab. */
let bootstrapPromise: Promise<ServerSessionState> | null = null;

export function bootstrapSession(): Promise<ServerSessionState> {
  bootstrapPromise ??= bootstrap().catch((err) => {
    bootstrapPromise = null; /* allow retry after e.g. server restart */
    throw err;
  });
  return bootstrapPromise;
}

export function useServerSession(): {
  session: ServerSessionState | null;
  error: string | null;
} {
  const [session, setSession] = useState<ServerSessionState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    bootstrapSession().then(
      (s) => {
        if (!cancelled) setSession(s);
      },
      (err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return { session, error };
}

export function useApiKey(): [string, (key: string) => void] {
  const [key, setKey] = useState(() => sessionStorage.getItem(API_KEY_KEY) ?? "");

  const update = (next: string) => {
    setKey(next);
    if (next) {
      sessionStorage.setItem(API_KEY_KEY, next);
    } else {
      sessionStorage.removeItem(API_KEY_KEY);
    }
  };

  return [key, update];
}
