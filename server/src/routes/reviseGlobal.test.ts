import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { HttpError } from "../errors.ts";
import { SessionStore, type Session } from "../session/store.ts";
import type { PRD, Project } from "../types.ts";
import { reviseGlobalRouter } from "./reviseGlobal.ts";

/*
 * Route tests for POST /api/revise-global, in the style of critic.test.ts: a
 * real express app on an ephemeral port, driven with fetch. supertest is not
 * available. The one difference is that this route makes an LLM call, so the
 * global fetch is stubbed to intercept the OpenRouter URL (returning canned
 * revise-global JSON, and capturing the outgoing request body) while letting
 * the test's own localhost request through to the real fetch.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const realFetch = globalThis.fetch;

let lastLlmBody: any = null;

/* Intercept only the OpenRouter call; everything else (the localhost request
 * to our own express server) goes to the real fetch. */
function stubLlm(reviseGlobalOutput: unknown): void {
  lastLlmBody = null;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (String(url) === OPENROUTER_URL) {
      lastLlmBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(reviseGlobalOutput) } }],
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
    nextRequirementNumber: 4,
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
      {
        id: "FR-2",
        text: "User can tag a saved item.",
        section: "functionalRequirements",
        status: "accepted",
        flag: null,
      },
      {
        id: "FR-3",
        text: "User can delete a saved item.",
        section: "functionalRequirements",
        status: "accepted",
        flag: null,
      },
    ],
    outOfScope: ["Multi-user collaboration"],
    openQuestions: ["Is mobile capture needed?"],
  };
  session.project = project;
  session.prd = prd;
  return session;
}

async function post(store: SessionStore, sessionId: string, body: unknown) {
  const app = express();
  app.use(express.json());
  app.use("/api/revise-global", reviseGlobalRouter(store));
  /* Mirror the app-level error handler so HttpErrors become JSON, not 500s. */
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
    const res = await fetch(`http://localhost:${port}/api/revise-global`, {
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

test("applies a full diff: change, split, removal, two adds, and a section rewrite", async () => {
  const store = new SessionStore();
  const session = seedSession(store);

  stubLlm({
    changedRequirements: [
      { id: "FR-1", revisedText: "User can save an image from a URL." },
      { id: "FR-2", revisedText: "User can add a tag to a saved item.\nUser can remove a tag from a saved item." },
    ],
    newRequirements: [
      { text: "User can search saved items by tag." },
      { text: "User can sort saved items by date." },
    ],
    removedRequirementIds: ["FR-3"],
    otherSectionChanges: {
      problemStatement: null,
      targetUsers: null,
      goals: ["Refinding a saved item takes seconds", "Searching returns results quickly"],
      outOfScope: null,
      openQuestions: null,
    },
  });

  const { status, data } = await post(store, session.id, {
    feedback: "Add search and sort, split tagging, and drop delete.",
  });

  assert.equal(status, 200);
  assert.equal(data.applied, true);

  /* FR-1 single-line change, FR-2 split into FR-2.1 / FR-2.2. */
  assert.deepEqual(data.changedRequirementIds, ["FR-1", "FR-2.1", "FR-2.2"]);
  /* New ids come from the monotonic counter, so the just-removed FR-3 is
   * NOT reissued - the new requirements are FR-4 and FR-5. */
  assert.deepEqual(data.newRequirementIds, ["FR-4", "FR-5"]);
  assert.deepEqual(data.removedRequirementIds, ["FR-3"]);
  assert.deepEqual(data.changedSections, ["goals"]);

  /* Version bumped 1 -> 2. */
  assert.equal(data.state.prd.version, 2);

  const reqs = data.state.prd.functionalRequirements as any[];
  const byId = new Map(reqs.map((r) => [r.id, r]));
  assert.equal(byId.get("FR-1").text, "User can save an image from a URL.");
  assert.equal(byId.get("FR-1").status, "draft");
  assert.equal(byId.get("FR-2.1").text, "User can add a tag to a saved item.");
  assert.equal(byId.get("FR-2.2").text, "User can remove a tag from a saved item.");
  assert.equal(byId.has("FR-2"), false);
  /* The removed FR-3 stays retired for good. */
  assert.equal(byId.has("FR-3"), false);
  assert.equal(byId.get("FR-4").text, "User can search saved items by tag.");
  assert.equal(byId.get("FR-4").status, "draft");
  assert.equal(byId.get("FR-5").text, "User can sort saved items by date.");

  assert.deepEqual(data.state.prd.goals, [
    "Refinding a saved item takes seconds",
    "Searching returns results quickly",
  ]);

  assert.equal(typeof data.summary, "string");
  assert.ok(data.summary.length > 0);
});

test("skips unknown changed and removed ids without erroring", async () => {
  const store = new SessionStore();
  const session = seedSession(store);

  stubLlm({
    changedRequirements: [{ id: "FR-999", revisedText: "Ghost requirement." }],
    newRequirements: [],
    removedRequirementIds: ["FR-888"],
    otherSectionChanges: {
      problemStatement: null,
      targetUsers: null,
      goals: null,
      outOfScope: null,
      openQuestions: null,
    },
  });

  const { status, data } = await post(store, session.id, {
    feedback: "Change and remove things that don't exist.",
  });

  assert.equal(status, 200);
  assert.equal(data.applied, false);
  assert.deepEqual(data.changedRequirementIds, []);
  assert.deepEqual(data.removedRequirementIds, []);
  /* No requirement was touched. */
  assert.equal(data.state.prd.functionalRequirements.length, 3);
  assert.equal(data.state.prd.version, 1);
});

test("an empty diff leaves the version and reports applied=false with a non-empty summary", async () => {
  const store = new SessionStore();
  const session = seedSession(store);

  stubLlm({
    changedRequirements: [],
    newRequirements: [],
    removedRequirementIds: [],
    otherSectionChanges: {
      problemStatement: null,
      targetUsers: null,
      goals: null,
      outOfScope: null,
      openQuestions: null,
    },
  });

  const { status, data } = await post(store, session.id, {
    feedback: "Just checking - no change needed.",
  });

  assert.equal(status, 200);
  assert.equal(data.applied, false);
  assert.equal(data.state.prd.version, 1);
  assert.equal(typeof data.summary, "string");
  assert.ok(data.summary.length > 0);
  assert.equal(data.annotationId, null);
});

test("a valid section targetId records an annotation and passes the target to the LLM", async () => {
  const store = new SessionStore();
  const session = seedSession(store);

  stubLlm({
    changedRequirements: [],
    newRequirements: [{ text: "User can pin a favorite item." }],
    removedRequirementIds: [],
    otherSectionChanges: {
      problemStatement: null,
      targetUsers: null,
      goals: null,
      outOfScope: null,
      openQuestions: null,
    },
  });

  const { status, data } = await post(store, session.id, {
    feedback: "This goal should also cover pinning.",
    targetId: "g-1",
  });

  assert.equal(status, 200);
  assert.equal(data.applied, true);
  assert.equal(typeof data.annotationId, "string");

  const annotations = data.state.annotations as any[];
  assert.equal(annotations.length, 1);
  assert.equal(annotations[0].targetId, "g-1");
  assert.equal(annotations[0].userComment, "This goal should also cover pinning.");
  assert.equal(annotations[0].agentResponse, data.summary);
  assert.equal(annotations[0].resolved, true);

  /* The outgoing LLM user message names the target. */
  const userMessage = lastLlmBody.messages[1].content as string;
  assert.match(userMessage, /left as a comment on goal 1: "Refinding a saved item takes seconds"/);
});

test("an out-of-range section targetId is a 400 before any LLM call", async () => {
  const store = new SessionStore();
  const session = seedSession(store);

  stubLlm({
    changedRequirements: [],
    newRequirements: [],
    removedRequirementIds: [],
    otherSectionChanges: {
      problemStatement: null,
      targetUsers: null,
      goals: null,
      outOfScope: null,
      openQuestions: null,
    },
  });

  const { status, data } = await post(store, session.id, {
    feedback: "Comment on a nonexistent goal.",
    targetId: "g-9",
  });

  assert.equal(status, 400);
  assert.equal(data.error.code, "INVALID_INPUT");
  /* The LLM was never called - the guard runs before callLLM. */
  assert.equal(lastLlmBody, null);
});

test("missing or empty feedback is a 400", async () => {
  const store = new SessionStore();
  const session = seedSession(store);
  stubLlm({});

  const missing = await post(store, session.id, {});
  assert.equal(missing.status, 400);
  assert.equal(missing.data.error.code, "INVALID_INPUT");

  const empty = await post(store, session.id, { feedback: "   " });
  assert.equal(empty.status, 400);
  assert.equal(empty.data.error.code, "INVALID_INPUT");

  assert.equal(lastLlmBody, null);
});
