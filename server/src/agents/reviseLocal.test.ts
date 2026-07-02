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
  });
  assert.match(message, /suggestedRewrite: rewrite text/);
  assert.match(message, /assumption: an assumption/);
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
