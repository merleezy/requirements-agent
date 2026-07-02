import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { SessionStore } from "../session/store.ts";
import { criticRouter } from "./critic.ts";

test("critic router skips LLM calls for accepted-as-is requirements", async () => {
  const store = new SessionStore();
  const session = store.create();
  const sessionId = session.id;

  session.project = {
    title: "Test Project",
    ideaText: "An idea text",
    createdAt: new Date().toISOString(),
    stage: "reviewing",
  };
  session.prd = {
    summary: "PRD Summary",
    problemStatement: "Problem statement",
    targetUsers: ["Target user 1"],
    goals: ["Goal 1"],
    functionalRequirements: [
      {
        id: "FR-1",
        text: "This requirement was accepted as-is by the user.",
        section: "functionalRequirements",
        status: "accepted",
        flag: null,
        acceptedAsIs: true,
      },
    ],
    outOfScope: ["Out of scope 1"],
    openQuestions: ["Open question 1"],
  };

  const app = express();
  app.use(express.json());
  app.use("/api/critic", criticRouter(store));

  const server = app.listen(0);
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://localhost:${port}/api/critic`, {
      method: "POST",
      headers: {
        "x-session-id": sessionId,
        "x-openrouter-key": "fake-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 200);
    const data = (await res.json()) as any;
    assert.deepEqual(data.failures, []);
    assert.equal(data.state.prd.functionalRequirements[0].status, "accepted");
    assert.equal(data.state.prd.functionalRequirements[0].flag, null);
  } finally {
    server.close();
  }
});
