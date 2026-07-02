import { api } from "./api";
import { bootstrapSession } from "./session";

/*
 * Step 8: the settings page's data layer - the model catalog (OpenRouter's
 * list plus the presets, both served by GET /api/models) and the session's
 * per-stage model config (read via GET /api/session, saved via
 * PUT /api/session/model-config). Types deliberately mirror the server's
 * (server/src/llm/modelConfig.ts, models.ts) rather than sharing a package,
 * consistent with the rest of the wire types.
 */

export const STAGES = [
  "clarify",
  "draft",
  "critic",
  "revise_local",
  "revise_global",
] as const;

export type Stage = (typeof STAGES)[number];

export type ModelConfig = Record<Stage, { model: string }>;

export interface ModelInfo {
  id: string;
  name: string;
  /* USD per token; null when unpriced/unknown. */
  promptPrice: number | null;
  completionPrice: number | null;
}

export interface ModelPreset {
  id: string;
  name: string;
  description: string;
  config: ModelConfig;
}

export interface ModelCatalog {
  models: ModelInfo[];
  presets: ModelPreset[];
}

export async function fetchModelCatalog(): Promise<ModelCatalog> {
  return api<ModelCatalog>("/models");
}

export async function fetchModelConfig(): Promise<ModelConfig> {
  const { sessionId } = await bootstrapSession();
  const state = await api<{ modelConfig: ModelConfig }>("/session", { sessionId });
  return state.modelConfig;
}

export async function saveModelConfig(config: ModelConfig): Promise<void> {
  const { sessionId } = await bootstrapSession();
  await api("/session/model-config", {
    method: "PUT",
    sessionId,
    body: { modelConfig: config },
  });
}

export function sameModelConfig(a: ModelConfig, b: ModelConfig): boolean {
  return STAGES.every((stage) => a[stage].model === b[stage].model);
}
