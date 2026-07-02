import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDraftUserMessage, parseDraftOutput } from "./draft.ts";

test("user message includes the idea and marks missing clarifications", () => {
  const message = buildDraftUserMessage({
    ideaText: "A bookmarking app",
    clarifications: [],
  });
  assert.match(message, /A bookmarking app/);
  assert.match(message, /\(none\)/);
});

test("user message formats Q&A pairs", () => {
  const message = buildDraftUserMessage({
    ideaText: "A bookmarking app",
    clarifications: [{ question: "Single-user?", answer: "Yes." }],
  });
  assert.match(message, /Q: Single-user\?/);
  assert.match(message, /A: Yes\./);
});

test("user message marks skipped answers explicitly", () => {
  const message = buildDraftUserMessage({
    ideaText: "A bookmarking app",
    clarifications: [{ question: "Single-user?", answer: "" }],
  });
  assert.match(message, /A: \(no answer provided\)/);
});

const validRaw = {
  title: "T",
  summary: "S",
  problemStatement: "P",
  targetUsers: ["u"],
  goals: ["g"],
  functionalRequirements: [{ text: "does a thing" }],
  outOfScope: [],
  openQuestions: [],
};

test("parseDraftOutput accepts a valid shape and ignores extra fields", () => {
  const output = parseDraftOutput({
    ...validRaw,
    functionalRequirements: [{ id: "model-id", text: "does a thing", extra: 1 }],
  });
  assert.equal(output.title, "T");
  assert.equal(output.summary, "S");
  assert.deepEqual(output.functionalRequirements, [{ text: "does a thing" }]);
});

test("parseDraftOutput rejects missing or malformed fields", () => {
  assert.throws(() => parseDraftOutput(null));
  assert.throws(() => parseDraftOutput({ ...validRaw, title: undefined }));
  assert.throws(() => parseDraftOutput({ ...validRaw, summary: "" }));
  assert.throws(() => parseDraftOutput({ ...validRaw, problemStatement: "" }));
  assert.throws(() => parseDraftOutput({ ...validRaw, targetUsers: ["u", 3] }));
  assert.throws(() => parseDraftOutput({ ...validRaw, functionalRequirements: [] }));
  assert.throws(() =>
    parseDraftOutput({ ...validRaw, functionalRequirements: [{ text: "" }] }),
  );
});
