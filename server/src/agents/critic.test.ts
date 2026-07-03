import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCriticUserMessage, parseCriticOutput } from "./critic.ts";

test("user message includes the requirement, its id, and all context", () => {
  const message = buildCriticUserMessage({
    requirement: { id: "FR-3", text: "The app displays the current temperature." },
    ideaText: "an app that checks the weather",
    problemStatement: "Commuters need a fast answer.",
    goals: ["Answer in under five seconds"],
  });
  assert.match(message, /id: FR-3/);
  assert.match(message, /displays the current temperature/);
  assert.match(message, /an app that checks the weather/);
  assert.match(message, /Commuters need a fast answer\./);
  assert.match(message, /- Answer in under five seconds/);
});

test("user message marks an empty goals list", () => {
  const message = buildCriticUserMessage({
    requirement: { id: "FR-1", text: "t" },
    ideaText: "i",
    problemStatement: "p",
    goals: [],
  });
  assert.match(message, /\(none stated\)/);
});

/* A well-formed failed check, used as the base for the rubric cases. */
const failedRaw = {
  requirementId: "FR-1",
  passed: false,
  dimension: "testable",
  nature: "defect",
  reason: "No pass/fail condition.",
  suggestedRewrite: "Returns results within 500ms.",
  assumption: null,
};

test("a pass nulls every other field, whatever the model sent", () => {
  const output = parseCriticOutput({
    requirementId: "FR-1",
    passed: true,
    dimension: "testable",
    nature: "defect",
    reason: "left over from a confused model",
    suggestedRewrite: "stray",
    assumption: "stray",
  });
  assert.deepEqual(output, {
    passed: true,
    dimension: null,
    nature: null,
    reason: null,
    suggestedRewrite: null,
    assumption: null,
  });
});

test("a failed testable check keeps its rewrite and derives nature", () => {
  const output = parseCriticOutput({ ...failedRaw, nature: "judgment" /* wrong */ });
  assert.equal(output.passed, false);
  assert.equal(output.dimension, "testable");
  assert.equal(output.nature, "defect" /* derived from the dimension, not trusted */);
  assert.equal(output.suggestedRewrite, "Returns results within 500ms.");
  assert.equal(output.assumption, null);
});

test("judgment dimensions never carry a rewrite or assumption", () => {
  for (const dimension of ["scoped", "traceable"]) {
    const output = parseCriticOutput({
      ...failedRaw,
      dimension,
      nature: "defect" /* wrong */,
      suggestedRewrite: "should be discarded",
      assumption: "should be discarded",
    });
    assert.equal(output.nature, "judgment");
    assert.equal(output.suggestedRewrite, null);
    assert.equal(output.assumption, null);
  }
});

test("an unambiguous rewrite without a stated assumption is dropped", () => {
  const output = parseCriticOutput({
    ...failedRaw,
    dimension: "unambiguous",
    suggestedRewrite: "a silently guessed interpretation",
    assumption: null,
  });
  assert.equal(output.dimension, "unambiguous");
  assert.equal(output.suggestedRewrite, null);
  assert.equal(output.assumption, null);
});

test("an unambiguous rewrite with a stated assumption keeps both", () => {
  const output = parseCriticOutput({
    ...failedRaw,
    dimension: "unambiguous",
    suggestedRewrite: "Folders and categories are one concept, named folders.",
    assumption: "Assuming 'categories' and 'folders' mean the same thing.",
  });
  assert.equal(output.suggestedRewrite, "Folders and categories are one concept, named folders.");
  assert.equal(output.assumption, "Assuming 'categories' and 'folders' mean the same thing.");
});

test("atomic and testable failures never carry an assumption", () => {
  for (const dimension of ["atomic", "testable"]) {
    const output = parseCriticOutput({
      ...failedRaw,
      dimension,
      assumption: "should be discarded",
    });
    assert.equal(output.assumption, null);
  }
});

test("empty-string rewrite and assumption normalize to null", () => {
  const output = parseCriticOutput({ ...failedRaw, suggestedRewrite: "", assumption: "" });
  assert.equal(output.suggestedRewrite, null);
  assert.equal(output.assumption, null);
});

test("id citations are stripped from suggestedRewrite", () => {
  const output = parseCriticOutput({
    ...failedRaw,
    suggestedRewrite: "Returns results within 500ms (see FR-2).",
  });
  assert.equal(output.suggestedRewrite, "Returns results within 500ms.");
});

test("rejects malformed outputs", () => {
  assert.throws(() => parseCriticOutput(null));
  assert.throws(() => parseCriticOutput({ ...failedRaw, passed: "no" }));
  assert.throws(() => parseCriticOutput({ ...failedRaw, dimension: null }));
  assert.throws(() => parseCriticOutput({ ...failedRaw, dimension: "vague" }));
  assert.throws(() => parseCriticOutput({ ...failedRaw, reason: "" }));
  assert.throws(() => parseCriticOutput({ ...failedRaw, reason: null }));
});
