import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReviseLocalUserMessage, parseReviseLocalOutput } from "./reviseLocal.ts";

const flag = {
  dimension: "unambiguous" as const,
  nature: "defect" as const,
  reason: "\"Categories and folders\" could mean the same thing or different things.",
  suggestedRewrite: null,
  assumption: null,
};

test("user message includes the requirement, the flag, and the response", () => {
  const message = buildReviseLocalUserMessage({
    requirement: { id: "FR-4", text: "Users can organize bookmarks into categories and folders." },
    flag,
    response: "Categories and folders are different - categories are tags, folders are nested storage.",
    openQuestions: [],
  });
  assert.match(message, /id: FR-4/);
  assert.match(message, /categories and folders\./);
  assert.match(message, /dimension: unambiguous/);
  assert.match(message, /reason: "Categories and folders"/);
  assert.match(message, /suggestedRewrite: \(none\)/);
  assert.match(message, /categories are tags, folders are nested storage\./);
});

test("user message renders a present suggestedRewrite and assumption", () => {
  const message = buildReviseLocalUserMessage({
    requirement: { id: "FR-1", text: "t" },
    flag: { ...flag, suggestedRewrite: "rewrite text", assumption: "an assumption" },
    response: "r",
    openQuestions: [],
  });
  assert.match(message, /suggestedRewrite: rewrite text/);
  assert.match(message, /assumption: an assumption/);
});

test("user message lists the PRD's open questions as read-only context", () => {
  const message = buildReviseLocalUserMessage({
    requirement: { id: "FR-1", text: "t" },
    flag,
    response: "r",
    openQuestions: ["Should users be able to edit expenses?", "Which currencies are supported?"],
  });
  assert.match(message, /open questions \(read-only context/);
  assert.match(message, /- Should users be able to edit expenses\?/);
  assert.match(message, /- Which currencies are supported\?/);
});

test("user message marks an empty open-question list", () => {
  const message = buildReviseLocalUserMessage({
    requirement: { id: "FR-1", text: "t" },
    flag,
    response: "r",
    openQuestions: [],
  });
  assert.match(message, /open questions[\s\S]*?\(none\)/);
});

test("parseReviseLocalOutput accepts a resolved revision", () => {
  const output = parseReviseLocalOutput({
    requirementId: "FR-4",
    revisedText: "Users can tag bookmarks with categories.",
    unresolved: null,
  });
  assert.equal(output.revisedText, "Users can tag bookmarks with categories.");
  assert.equal(output.unresolved, null);
});

test("parseReviseLocalOutput accepts an honest unresolved", () => {
  const output = parseReviseLocalOutput({
    requirementId: "FR-4",
    revisedText: null,
    unresolved: "The response doesn't say whether folders can be nested.",
  });
  assert.equal(output.revisedText, null);
  assert.equal(output.unresolved, "The response doesn't say whether folders can be nested.");
});

test("rejects neither field set", () => {
  assert.throws(() =>
    parseReviseLocalOutput({ requirementId: "FR-1", revisedText: null, unresolved: null }),
  );
});

test("rejects both fields set", () => {
  assert.throws(() =>
    parseReviseLocalOutput({ requirementId: "FR-1", revisedText: "x", unresolved: "y" }),
  );
});

test("empty strings normalize to null, so an all-blank reply is rejected", () => {
  assert.throws(() =>
    parseReviseLocalOutput({ requirementId: "FR-1", revisedText: "", unresolved: "" }),
  );
});

test("rejects a non-object", () => {
  assert.throws(() => parseReviseLocalOutput(null));
  assert.throws(() => parseReviseLocalOutput("nope"));
});

test("id citations are stripped from revisedText, preserving split newlines", () => {
  const output = parseReviseLocalOutput({
    requirementId: "FR-4",
    revisedText: "Users can tag bookmarks (per FR-2).\nUsers can nest folders.",
    unresolved: null,
  });
  assert.equal(output.revisedText, "Users can tag bookmarks.\nUsers can nest folders.");
});
