/*
 * Per-stage model selection (spec: "Model configuration").
 *
 * Every stage's model is resolved by callLLM reading modelConfig[stage].model
 * from the session - never a literal model string at a call site. These are
 * the spec's "Balanced" defaults; each new session starts from a copy, and the
 * settings page (step 8) writes into the session's copy.
 */

export type Stage =
  | "clarify"
  | "draft"
  | "critic"
  | "revise_local"
  | "revise_global";

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
