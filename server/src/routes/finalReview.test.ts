import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { HttpError } from "../errors.ts";
import { SessionStore, type Session } from "../session/store.ts";
import type { PRD, Project } from "../types.ts";
import { finalReviewRouter } from "./finalReview.ts";

/*
 * Route tests for POST /api/final-review, in the style of
 * reviseGlobal.test.ts: a real express app on an ephemeral port, with the
 * global fetch stubbed only for the OpenRouter URL so the outgoing LLM
 * request body can be inspected.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const realFetch = globalThis.fetch;

let lastLlmBody: any = null;

function stubLlm(finalReviewOutput: unknown): void {
  lastLlmBody = null;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (String(url) === OPENROUTER_URL) {
      lastLlmBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(finalReviewOutput) } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return realFetch(url as any, init);
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  lastLlmBody = null;
});

function seedSession(store: SessionStore): Session {
  const session = store.create();
  const project: Project = {
    title: "Design Inspiration Bookmarking",
    ideaText: "A bookmarking app for designers",
    createdAt: new Date().toISOString(),
    stage: "reviewing",
  };
  const prd: PRD = {
    version: 1,
    nextRequirementNumber: 2,
    summary: "Saves and organizes design screenshots for designers.",
    problemStatement: "Designers lose track of saved inspiration.",
    targetUsers: ["Freelance designers"],
    goals: ["Refinding a saved item takes seconds"],
    functionalRequirements: [
      {
        id: "FR-1",
        text: "User can save a screenshot from a URL.",
        section: "functionalRequirements",
        status: "accepted",
        flag: null,
      },
    ],
    outOfScope: [],
    openQuestions: [],
  };
  session.project = project;
  session.prd = prd;
  return session;
}

async function post(store: SessionStore, sessionId: string, body: unknown) {
  const app = express();
  app.use(express.json());
  app.use("/api/final-review", finalReviewRouter(store));
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
    const res = await fetch(`http://localhost:${port}/api/final-review`, {
      method: "POST",
      headers: {
        "x-session-id": sessionId,
        "x-openrouter-key": "fake-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as any;
    return { status: res.status, data };
  } finally {
    server.close();
  }
}

const passOutput = { status: "PASS", summary: "Buildable.", issues: [] };

test("previousFindings reach the LLM user message with their dispositions", async () => {
  const store = new SessionStore();
  const session = seedSession(store);
  stubLlm(passOutput);

  const { status } = await post(store, session.id, {
    previousFindings: [
      {
        severity: "high",
        category: "Conflict",
        location: "FR-1",
        explanation: "Save and delete semantics contradict.",
        disposition: "fix_applied",
      },
      {
        severity: "low",
        category: "Terminology",
        location: "PRD Document",
        explanation: "Screenshot vs image drift.",
        disposition: "not_addressed",
      },
    ],
  });

  assert.equal(status, 200);
  const userMessage = lastLlmBody.messages.find((m: any) => m.role === "user").content;
  assert.ok(userMessage.includes("previous review round"));
  assert.ok(userMessage.includes("Save and delete semantics contradict. (fix applied)"));
  assert.ok(userMessage.includes("Screenshot vs image drift. (left as-is)"));
});

test("no previousFindings means no previous-round section in the user message", async () => {
  const store = new SessionStore();
  const session = seedSession(store);
  stubLlm(passOutput);

  const { status } = await post(store, session.id, {});

  assert.equal(status, 200);
  const userMessage = lastLlmBody.messages.find((m: any) => m.role === "user").content;
  assert.ok(!userMessage.includes("previous review round"));
});

test("malformed previousFindings are a 400 before any LLM call", async () => {
  const store = new SessionStore();
  const session = seedSession(store);
  stubLlm(passOutput);

  for (const previousFindings of ["not-an-array", [{ severity: "high" }]]) {
    const { status, data } = await post(store, session.id, { previousFindings });
    assert.equal(status, 400);
    assert.equal(data.error.code, "INVALID_INPUT");
    assert.equal(lastLlmBody, null);
  }
});

test("a reply with only medium/low issues comes back as PASS with notes", async () => {
  const store = new SessionStore();
  const session = seedSession(store);
  stubLlm({
    status: "REQUIRES_CHANGES",
    summary: "Minor observations.",
    issues: [
      {
        severity: "medium",
        category: "Undefined Behavior",
        location: "FR-1",
        explanation: "Duplicate-URL saves are unspecified.",
        recommendation: "State whether re-saving a URL creates a duplicate.",
      },
    ],
  });

  const { status, data } = await post(store, session.id, {});

  assert.equal(status, 200);
  assert.equal(data.status, "PASS");
  assert.equal(data.issues.length, 1);
  assert.equal(data.issues[0].severity, "medium");
});
