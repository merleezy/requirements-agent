import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { HttpError } from "../errors.ts";
import { SessionStore, type Session } from "../session/store.ts";
import { callLLM, type CallContext } from "./callLLM.ts";

/*
 * Unit tests for the callLLM/modelConfig abstraction (spec: "Testing &
 * production hardening" - these land with step 5, not later). fetch is
 * stubbed at the global level; no test talks to OpenRouter.
 */

const TEST_KEY = "sk-or-test-key-123";

const validDraftJson = JSON.stringify({
  title: "Design Inspiration Bookmarking",
  summary: "Saves and organizes design screenshots for designers.",
  problemStatement: "Designers lose track of saved inspiration.",
  targetUsers: ["Freelance designers"],
  goals: ["Refinding a saved item takes seconds"],
  functionalRequirements: [
    { id: "model-id-1", text: "User can save a screenshot from a URL." },
  ],
  outOfScope: ["Multi-user collaboration"],
  openQuestions: ["Is mobile capture needed?"],
});

const draftInput = { ideaText: "A bookmarking app", clarifications: [] };

let lastRequest: { url: string; init: RequestInit } | null = null;
const realFetch = globalThis.fetch;

function stubFetch(respond: () => Response | Promise<Response>): void {
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    lastRequest = { url: String(url), init: init ?? {} };
    return respond();
  }) as typeof fetch;
}

function openRouterReply(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function makeContext(): { session: Session; ctx: CallContext } {
  const session = new SessionStore().create();
  return { session, ctx: { session, apiKey: TEST_KEY } };
}

afterEach(() => {
  globalThis.fetch = realFetch;
  lastRequest = null;
});

test("resolves the model from the session's modelConfig, never a call-site literal", async () => {
  const { session, ctx } = makeContext();
  session.modelConfig.draft.model = "test/custom-model";
  stubFetch(() => openRouterReply(validDraftJson));

  await callLLM("draft", draftInput, ctx);

  const body = JSON.parse(String(lastRequest?.init.body));
  assert.equal(body.model, "test/custom-model");
});

test("sends the key in the Authorization header and includes system + user messages", async () => {
  const { ctx } = makeContext();
  stubFetch(() => openRouterReply(validDraftJson));

  await callLLM("draft", draftInput, ctx);

  const headers = lastRequest?.init.headers as Record<string, string>;
  assert.equal(headers.Authorization, `Bearer ${TEST_KEY}`);
  const body = JSON.parse(String(lastRequest?.init.body));
  assert.equal(body.messages.length, 2);
  assert.equal(body.messages[0].role, "system");
  assert.match(body.messages[1].content, /A bookmarking app/);
});

test("records a key-free AgentRun on success", async () => {
  const { session, ctx } = makeContext();
  stubFetch(() => openRouterReply(validDraftJson));

  const output = await callLLM("draft", draftInput, ctx);

  assert.equal(output.functionalRequirements[0]?.text, "User can save a screenshot from a URL.");
  assert.equal(session.agentRuns.length, 1);
  const run = session.agentRuns[0];
  assert.equal(run?.stage, "draft");
  assert.deepEqual(run?.input, draftInput);
  /* Neither the run nor anything else on the session may retain the key. */
  assert.ok(!JSON.stringify(session).includes(TEST_KEY));
});

test("accepts JSON wrapped in a markdown code fence", async () => {
  const { ctx } = makeContext();
  stubFetch(() => openRouterReply("```json\n" + validDraftJson + "\n```"));

  const output = await callLLM("draft", draftInput, ctx);
  assert.equal(output.targetUsers[0], "Freelance designers");
});

test("maps upstream 401 to LLM_UNAUTHORIZED without leaking the key", async () => {
  const { session, ctx } = makeContext();
  stubFetch(
    () =>
      new Response(JSON.stringify({ error: { message: "Invalid key" } }), {
        status: 401,
      }),
  );

  await assert.rejects(callLLM("draft", draftInput, ctx), (err: unknown) => {
    assert.ok(err instanceof HttpError);
    assert.equal(err.status, 401);
    assert.equal(err.code, "LLM_UNAUTHORIZED");
    assert.ok(!err.message.includes(TEST_KEY));
    return true;
  });
  assert.equal(session.agentRuns.length, 0);
});

test("maps a non-JSON reply to LLM_BAD_OUTPUT and records no AgentRun", async () => {
  const { session, ctx } = makeContext();
  stubFetch(() => openRouterReply("Sure! Here is your PRD as prose."));

  await assert.rejects(callLLM("draft", draftInput, ctx), (err: unknown) => {
    assert.ok(err instanceof HttpError);
    assert.equal(err.code, "LLM_BAD_OUTPUT");
    return true;
  });
  assert.equal(session.agentRuns.length, 0);
});

test("maps a wrong-shaped JSON reply to LLM_BAD_OUTPUT", async () => {
  const { ctx } = makeContext();
  stubFetch(() => openRouterReply(JSON.stringify({ problemStatement: "x" })));

  await assert.rejects(callLLM("draft", draftInput, ctx), (err: unknown) => {
    assert.ok(err instanceof HttpError);
    assert.equal(err.code, "LLM_BAD_OUTPUT");
    return true;
  });
});

test("maps a network failure to LLM_UNREACHABLE", async () => {
  const { ctx } = makeContext();
  stubFetch(() => {
    throw new TypeError("fetch failed");
  });

  await assert.rejects(callLLM("draft", draftInput, ctx), (err: unknown) => {
    assert.ok(err instanceof HttpError);
    assert.equal(err.status, 502);
    assert.equal(err.code, "LLM_UNREACHABLE");
    return true;
  });
});
