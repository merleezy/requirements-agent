/*
 * Per-stage model selection (spec: "Model configuration").
 *
 * Every stage's model is resolved by callLLM reading modelConfig[stage].model
 * from the session - never a literal model string at a call site. These are
 * the spec's "Balanced" defaults; each new session starts from a copy, and the
 * settings page (step 8) writes into the session's copy.
 */

export const STAGES = [
  "clarify",
  "draft",
  "critic",
  "revise_local",
  "revise_global",
] as const;

export type Stage = (typeof STAGES)[number];

export interface StageModelConfig {
  model: string;
}

export type ModelConfig = Record<Stage, StageModelConfig>;

export const defaultModelConfig: ModelConfig = {
  clarify: { model: "deepseek/deepseek-v4-flash" },
  draft: { model: "z-ai/glm-5.2" },
  critic: { model: "deepseek/deepseek-v4-flash" },
  revise_local: { model: "z-ai/glm-5.2" },
  revise_global: { model: "z-ai/glm-5.2" },
};

export function createModelConfig(): ModelConfig {
  return structuredClone(defaultModelConfig);
}

/*
 * Presets (spec: "Budget" / "Balanced" / "Max quality"). Selecting one in
 * the settings UI just writes all five stage values at once; "Balanced" IS
 * the per-session default above, so there is one source of truth for it.
 */

export interface ModelPreset {
  id: "budget" | "balanced" | "max_quality";
  name: string;
  description: string;
  config: ModelConfig;
}

export const modelPresets: ModelPreset[] = [
  {
    id: "budget",
    name: "Budget",
    description: "The cheapest capable model on every stage.",
    config: {
      clarify: { model: "deepseek/deepseek-v4-flash" },
      draft: { model: "deepseek/deepseek-v4-flash" },
      critic: { model: "deepseek/deepseek-v4-flash" },
      revise_local: { model: "deepseek/deepseek-v4-flash" },
      revise_global: { model: "deepseek/deepseek-v4-flash" },
    },
  },
  {
    id: "balanced",
    name: "Balanced",
    description: "Fast models where they're enough, strong ones where writing quality counts.",
    config: defaultModelConfig,
  },
  {
    id: "max_quality",
    name: "Max quality",
    description: "Frontier models on every stage, cost aside.",
    config: {
      clarify: { model: "anthropic/claude-sonnet-5" },
      draft: { model: "anthropic/claude-opus-4.8" },
      critic: { model: "anthropic/claude-sonnet-5" },
      revise_local: { model: "anthropic/claude-opus-4.8" },
      revise_global: { model: "anthropic/claude-opus-4.8" },
    },
  },
];

const MAX_MODEL_ID_LENGTH = 200;

/*
 * Validates a settings-save body into a fresh ModelConfig. Strict on shape
 * (exactly the five stages, nothing else) so a typo'd stage name fails the
 * save instead of silently leaving that stage on its old model. Throws plain
 * Errors; the route wraps them in the API's uniform 400 shape.
 */
export function parseModelConfig(value: unknown): ModelConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("modelConfig must be an object keyed by stage.");
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!(STAGES as readonly string[]).includes(key)) {
      throw new Error(`Unknown stage "${key}".`);
    }
  }
  const config = {} as ModelConfig;
  for (const stage of STAGES) {
    const entry = record[stage];
    const model =
      typeof entry === "object" && entry !== null
        ? (entry as { model?: unknown }).model
        : undefined;
    if (typeof model !== "string" || model.trim().length === 0) {
      throw new Error(`Stage "${stage}" must be { model: <non-empty string> }.`);
    }
    if (model.length > MAX_MODEL_ID_LENGTH) {
      throw new Error(
        `Stage "${stage}" model id must be at most ${MAX_MODEL_ID_LENGTH} characters.`,
      );
    }
    config[stage] = { model: model.trim() };
  }
  return config;
}
