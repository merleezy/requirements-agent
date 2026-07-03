import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildReviseGlobalUserMessage,
  parseReviseGlobalOutput,
  type ReviseGlobalInput,
} from "./reviseGlobal.ts";

/*
 * Unit tests for the revise-global agent's user-message builder and output
 * parser (spec exception to the testing deferral - the revise pieces land
 * with step 9). No LLM is involved.
 */

function makeInput(overrides: Partial<ReviseGlobalInput> = {}): ReviseGlobalInput {
  return {
    ideaText: "A bookmarking app for designers",
    title: "Design Inspiration Bookmarking",
    prd: {
      problemStatement: "Designers lose track of saved inspiration.",
      targetUsers: ["Freelance designers"],
      goals: ["Refinding a saved item takes seconds"],
      functionalRequirements: [
        { id: "FR-1", text: "User can save a screenshot from a URL." },
        { id: "FR-2", text: "User can tag a saved item." },
      ],
      outOfScope: ["Multi-user collaboration"],
      openQuestions: ["Is mobile capture needed?"],
    },
    feedback: "Add a way to search saved items.",
    target: null,
    ...overrides,
  };
}

test("builder includes the PRD JSON with requirement ids, the idea, and the feedback", () => {
  const message = buildReviseGlobalUserMessage(makeInput());

  assert.match(message, /"id": "FR-1"/);
  assert.match(message, /"id": "FR-2"/);
  assert.match(message, /User can save a screenshot from a URL\./);
  assert.match(message, /A bookmarking app for designers/);
  assert.match(message, /Add a way to search saved items\./);
});

test("builder omits requirement status/flag noise, rendering id + text only", () => {
  const message = buildReviseGlobalUserMessage(makeInput());
  assert.doesNotMatch(message, /"status"/);
  assert.doesNotMatch(message, /"flag"/);
  assert.doesNotMatch(message, /"acceptedAsIs"/);
});

test("builder states the target when the feedback is a comment on a specific part", () => {
  const message = buildReviseGlobalUserMessage(
    makeInput({
      target: {
        id: "g-1",
        description: "goal 1",
        text: "Refinding a saved item takes seconds",
      },
    }),
  );
  assert.match(
    message,
    /This feedback was left as a comment on goal 1: "Refinding a saved item takes seconds"/,
  );
});

test("builder omits the target line when target is null", () => {
  const message = buildReviseGlobalUserMessage(makeInput({ target: null }));
  assert.doesNotMatch(message, /left as a comment on/);
});

test("parser accepts a full valid diff and trims texts", () => {
  const output = parseReviseGlobalOutput({
    changedRequirements: [{ id: "FR-1", revisedText: "  User can save an image from a URL.  " }],
    newRequirements: [{ text: "  User can search saved items by tag.  " }],
    removedRequirementIds: ["FR-2"],
    otherSectionChanges: {
      problemStatement: null,
      targetUsers: null,
      goals: ["Refinding takes seconds", "Searching is fast"],
      outOfScope: null,
      openQuestions: null,
    },
  });

  assert.deepEqual(output.changedRequirements, [
    { id: "FR-1", revisedText: "User can save an image from a URL." },
  ]);
  assert.deepEqual(output.newRequirements, [{ text: "User can search saved items by tag." }]);
  assert.deepEqual(output.removedRequirementIds, ["FR-2"]);
  assert.deepEqual(output.otherSectionChanges.goals, [
    "Refinding takes seconds",
    "Searching is fast",
  ]);
  assert.equal(output.otherSectionChanges.problemStatement, null);
});

test("parser normalizes a missing otherSectionChanges to all-null", () => {
  const output = parseReviseGlobalOutput({
    changedRequirements: [],
    newRequirements: [],
    removedRequirementIds: [],
  });
  assert.deepEqual(output.otherSectionChanges, {
    problemStatement: null,
    targetUsers: null,
    goals: null,
    outOfScope: null,
    openQuestions: null,
  });
});

test("parser accepts an empty array as a section (full-replacement clear)", () => {
  const output = parseReviseGlobalOutput({
    changedRequirements: [],
    newRequirements: [],
    removedRequirementIds: [],
    otherSectionChanges: {
      problemStatement: null,
      targetUsers: null,
      goals: null,
      outOfScope: [],
      openQuestions: null,
    },
  });
  assert.deepEqual(output.otherSectionChanges.outOfScope, []);
});

test("parser skips a non-string changedRequirement id", () => {
  const output = parseReviseGlobalOutput({
    changedRequirements: [{ id: 5, revisedText: "text" }],
    newRequirements: [],
    removedRequirementIds: [],
  });
  assert.deepEqual(output.changedRequirements, []);
});

test("parser skips a changedRequirement missing revisedText", () => {
  const output = parseReviseGlobalOutput({
    changedRequirements: [{ id: "FR-1" }],
    newRequirements: [],
    removedRequirementIds: [],
  });
  assert.deepEqual(output.changedRequirements, []);
});

test("parser rejects otherSectionChanges with a wrong type", () => {
  assert.throws(() =>
    parseReviseGlobalOutput({
      changedRequirements: [],
      newRequirements: [],
      removedRequirementIds: [],
      otherSectionChanges: { goals: "should be an array or null" },
    }),
  );
  assert.throws(() =>
    parseReviseGlobalOutput({
      changedRequirements: [],
      newRequirements: [],
      removedRequirementIds: [],
      otherSectionChanges: { goals: [1, 2, 3] },
    }),
  );
});

test("id citations are stripped from changed and new requirement text", () => {
  const output = parseReviseGlobalOutput({
    changedRequirements: [
      { id: "FR-1", revisedText: "User can save a screenshot (per FR-2) from a URL." },
    ],
    newRequirements: [{ text: "User can search saved items, as per FR-2." }],
    removedRequirementIds: [],
    otherSectionChanges: null,
  });
  assert.deepEqual(output.changedRequirements, [
    { id: "FR-1", revisedText: "User can save a screenshot from a URL." },
  ]);
  assert.deepEqual(output.newRequirements, [{ text: "User can search saved items." }]);
});
