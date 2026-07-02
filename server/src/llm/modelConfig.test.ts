import { test } from "node:test";
import assert from "node:assert/strict";
import { createModelConfig, defaultModelConfig, type Stage } from "./modelConfig.ts";

const ALL_STAGES: Stage[] = [
  "clarify",
  "draft",
  "critic",
  "revise_local",
  "revise_global",
];

test("every stage has a model in the defaults", () => {
  for (const stage of ALL_STAGES) {
    assert.ok(
      defaultModelConfig[stage].model.length > 0,
      `stage ${stage} has no default model`,
    );
  }
});

test("createModelConfig returns an independent copy per session", () => {
  const a = createModelConfig();
  const b = createModelConfig();
  a.draft.model = "test/mutated";

  assert.equal(b.draft.model, defaultModelConfig.draft.model);
  assert.notEqual(defaultModelConfig.draft.model, "test/mutated");
});
