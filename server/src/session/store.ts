import { randomUUID } from "node:crypto";
import type {
  Annotation,
  AgentRun,
  ClarifyState,
  Decision,
  PRD,
  Project,
} from "../types.ts";
import { createModelConfig, type ModelConfig } from "../llm/modelConfig.ts";

/*
 * In-memory session state (spec: backend "holds PRD/session state in memory").
 *
 * A session is one browser tab's working state. It is identified by a
 * server-generated UUID that the client stores in sessionStorage and sends
 * back in the x-session-id header. The user's API key is NOT part of this
 * state - it is attached per request only and never stored server-side.
 */

export interface Session {
  id: string;
  createdAt: string; /* ISO timestamp */
  lastActivityAt: number; /* epoch ms, for idle expiry */
  clarify: ClarifyState | null;
  project: Project | null;
  prd: PRD | null;
  annotations: Annotation[];
  agentRuns: AgentRun[];
  /* Durable settled decisions (accepted risks), fed to the final reviewer so
   * it can't re-raise them; round-trips through GET /api/session, so they
   * survive a page reload for the session lifetime. Append-only. */
  decisions: Decision[];
  modelConfig: ModelConfig;
}

/* What GET /api/session returns - everything except the expiry bookkeeping. */
export interface SessionState {
  sessionId: string;
  createdAt: string;
  clarify: ClarifyState | null;
  project: Project | null;
  prd: PRD | null;
  annotations: Annotation[];
  agentRuns: AgentRun[];
  decisions: Decision[];
  modelConfig: ModelConfig;
}

export function toSessionState(session: Session): SessionState {
  const {
    id,
    createdAt,
    clarify,
    project,
    prd,
    annotations,
    agentRuns,
    decisions,
    modelConfig,
  } = session;
  return {
    sessionId: id,
    createdAt,
    clarify,
    project,
    prd,
    annotations,
    agentRuns,
    decisions,
    modelConfig,
  };
}

const IDLE_TTL_MS = 24 * 60 * 60 * 1000; /* expire after 24h without a request */
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

export class SessionStore {
  private readonly sessions = new Map<string, Session>();

  constructor() {
    /* unref so the sweep timer never keeps the process alive on its own */
    setInterval(() => this.sweep(), SWEEP_INTERVAL_MS).unref();
  }

  create(): Session {
    const session: Session = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      lastActivityAt: Date.now(),
      clarify: null,
      project: null,
      prd: null,
      annotations: [],
      agentRuns: [],
      decisions: [],
      modelConfig: createModelConfig(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  /* Returns undefined for unknown or expired ids; touching resets the idle clock. */
  get(id: string): Session | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    if (Date.now() - session.lastActivityAt > IDLE_TTL_MS) {
      this.sessions.delete(id);
      return undefined;
    }
    session.lastActivityAt = Date.now();
    return session;
  }

  sweep(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivityAt > IDLE_TTL_MS) {
        this.sessions.delete(id);
      }
    }
  }
}
