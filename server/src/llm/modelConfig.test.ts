import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STAGES,
  createModelConfig,
  defaultModelConfig,
  modelPresets,
  parseModelConfig,
  type Stage,
} from "./modelConfig.ts";

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

test("every preset covers every stage with a model", () => {
  assert.equal(modelPresets.length, 3);
  for (const preset of modelPresets) {
    for (const stage of ALL_STAGES) {
      assert.ok(
        preset.config[stage].model.length > 0,
        `preset ${preset.id} has no model for stage ${stage}`,
      );
    }
  }
});

test("the Balanced preset is the per-session default", () => {
  const balanced = modelPresets.find((p) => p.id === "balanced");
  assert.deepEqual(balanced?.config, defaultModelConfig);
});

test("parseModelConfig accepts a full five-stage config and trims model ids", () => {
  const input = Object.fromEntries(
    STAGES.map((stage) => [stage, { model: `  test/${stage}-model  ` }]),
  );

  const parsed = parseModelConfig(input);

  for (const stage of ALL_STAGES) {
    assert.equal(parsed[stage].model, `test/${stage}-model`);
  }
});

test("parseModelConfig rejects a missing stage", () => {
  const input = Object.fromEntries(
    STAGES.filter((s) => s !== "critic").map((stage) => [stage, { model: "test/m" }]),
  );

  assert.throws(() => parseModelConfig(input), /critic/);
});

test("parseModelConfig rejects an unknown stage key", () => {
  const input = Object.fromEntries(STAGES.map((stage) => [stage, { model: "test/m" }]));

  assert.throws(
    () => parseModelConfig({ ...input, export: { model: "test/m" } }),
    /Unknown stage "export"/,
  );
});

test("parseModelConfig rejects empty, blank, and non-string models", () => {
  for (const bad of ["", "   ", 42, null, undefined]) {
    const input = Object.fromEntries(STAGES.map((stage) => [stage, { model: "test/m" }]));
    (input as Record<string, unknown>).draft = { model: bad };

    assert.throws(() => parseModelConfig(input), /draft/);
  }
});

test("parseModelConfig rejects non-object bodies and oversized model ids", () => {
  assert.throws(() => parseModelConfig(null), /object/);
  assert.throws(() => parseModelConfig([]), /object/);
  assert.throws(() => parseModelConfig("draft"), /object/);

  const input = Object.fromEntries(
    STAGES.map((stage) => [stage, { model: "x".repeat(201) }]),
  );
  assert.throws(() => parseModelConfig(input), /at most 200/);
});
