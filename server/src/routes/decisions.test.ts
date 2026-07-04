import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { HttpError } from "../errors.ts";
import { SessionStore } from "../session/store.ts";
import { decisionsRouter } from "./decisions.ts";

/*
 * Route tests for POST /api/decisions. No LLM call, so no fetch stub - a real
 * express app on an ephemeral port, same shape as the other route tests.
 */

async function post(
  store: SessionStore,
  sessionId: string | undefined,
  body: unknown,
) {
  const app = express();
  app.use(express.json());
  app.use("/api/decisions", decisionsRouter(store));
  app.use((err: any, _req: any, res: any, _next: any) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: "INTERNAL", message: String(err) } });
  });

  const server = app.listen(0);
  const port = (server.address() as any).port;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (sessionId) headers["x-session-id"] = sessionId;
    const res = await fetch(`http://localhost:${port}/api/decisions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    return { status: res.status, data: (await res.json()) as any };
  } finally {
    server.close();
  }
}

test("POST /api/decisions appends an accepted_risk decision and returns it", async () => {
  const store = new SessionStore();
  const session = store.create();

  const { status, data } = await post(store, session.id, {
    anchor: "FR-1",
    statement: "Manual entry fallback is acceptable.",
    category: "Lifecycle",
  });

  assert.equal(status, 201);
  assert.equal(data.decision.id, "D-1");
  assert.equal(data.decision.kind, "accepted_risk");
  assert.equal(data.decision.anchor, "FR-1");
  assert.equal(data.decision.category, "Lifecycle");
  assert.equal(session.decisions.length, 1);
});

test("POST /api/decisions dedups by (anchor, statement) and numbers distinct ones", async () => {
  const store = new SessionStore();
  const session = store.create();

  const first = await post(store, session.id, { anchor: "FR-1", statement: "Same." });
  const dup = await post(store, session.id, { anchor: "FR-1", statement: "Same." });
  const other = await post(store, session.id, { anchor: "FR-2", statement: "Different." });

  assert.equal(first.data.decision.id, "D-1");
  assert.equal(dup.data.decision.id, "D-1"); /* same decision back, not a new one */
  assert.equal(other.data.decision.id, "D-2");
  assert.equal(session.decisions.length, 2);
});

test("POST /api/decisions rejects an empty statement with 400", async () => {
  const store = new SessionStore();
  const session = store.create();

  const { status, data } = await post(store, session.id, { anchor: "FR-1", statement: "   " });

  assert.equal(status, 400);
  assert.equal(data.error.code, "INVALID_INPUT");
  assert.equal(session.decisions.length, 0);
});

test("POST /api/decisions returns 404 for an unknown session", async () => {
  const store = new SessionStore();

  const { status, data } = await post(store, "does-not-exist", {
    anchor: "FR-1",
    statement: "Anything.",
  });

  assert.equal(status, 404);
  assert.equal(data.error.code, "SESSION_NOT_FOUND");
});
