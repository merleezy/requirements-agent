import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClarifyUserMessage, parseClarifyOutput } from "./clarify.ts";

test("round-1 message is the idea alone", () => {
  const message = buildClarifyUserMessage({
    ideaText: "A bookmarking app",
    priorAnswers: null,
  });
  assert.match(message, /A bookmarking app/);
  assert.doesNotMatch(message, /Previously asked/);
  assert.doesNotMatch(message, /second and final round/);
});

test("round-2 message includes prior Q&A and the final-round instruction", () => {
  const message = buildClarifyUserMessage({
    ideaText: "A bookmarking app",
    priorAnswers: [{ question: "Single-user?", answer: "Yes." }],
  });
  assert.match(message, /A bookmarking app/);
  assert.match(message, /Q: Single-user\?/);
  assert.match(message, /A: Yes\./);
  assert.match(message, /second and final round/);
});

test("round-2 message marks skipped answers explicitly", () => {
  const message = buildClarifyUserMessage({
    ideaText: "A bookmarking app",
    priorAnswers: [{ question: "Single-user?", answer: "  " }],
  });
  assert.match(message, /A: \(no answer provided\)/);
});

const validQuestion = { question: "Who are the users?", whyItMatters: "Scopes the product." };

test("parseClarifyOutput accepts a valid shape and ignores extra fields", () => {
  const output = parseClarifyOutput({
    questions: [{ ...validQuestion, id: "model-id", extra: 1 }],
  });
  assert.deepEqual(output.questions, [validQuestion]);
});

test("parseClarifyOutput accepts an empty questions array", () => {
  assert.deepEqual(parseClarifyOutput({ questions: [] }).questions, []);
});

test("parseClarifyOutput truncates past the 8-question ceiling", () => {
  const output = parseClarifyOutput({
    questions: Array.from({ length: 10 }, (_, i) => ({
      question: `Q${i + 1}?`,
      whyItMatters: "w",
    })),
  });
  assert.equal(output.questions.length, 8);
  assert.equal(output.questions[7].question, "Q8?");
});

test("parseClarifyOutput rejects missing or malformed fields", () => {
  assert.throws(() => parseClarifyOutput(null));
  assert.throws(() => parseClarifyOutput({}));
  assert.throws(() => parseClarifyOutput({ questions: "none" }));
  assert.throws(() => parseClarifyOutput({ questions: ["a string"] }));
  assert.throws(() => parseClarifyOutput({ questions: [{ question: "Q?" }] }));
  assert.throws(() =>
    parseClarifyOutput({ questions: [{ ...validQuestion, question: "" }] }),
  );
  assert.throws(() =>
    parseClarifyOutput({ questions: [{ ...validQuestion, whyItMatters: "" }] }),
  );
});
