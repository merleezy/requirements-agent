import { HttpError } from "../errors.ts";

/*
 * The OpenRouter model catalog for the settings page (spec: "a dropdown per
 * stage, populated by fetching OpenRouter's /models list"). The endpoint is
 * public - no user key is involved - so the server proxies it with one
 * shared cache instead of every browser tab fetching ~300 models itself.
 * On a refetch failure a stale cache is served rather than erroring: an
 * hour-old model list is strictly better than no dropdown options.
 */

export interface ModelInfo {
  id: string;
  name: string;
  /* USD per token, as OpenRouter reports it; null when unpriced/unknown. */
  promptPrice: number | null;
  completionPrice: number | null;
}

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const CACHE_TTL_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 15_000;

let cache: { fetchedAt: number; models: ModelInfo[] } | null = null;

/* Test hooks only - reset/expire module state between test cases. */
export function resetModelListCache(): void {
  cache = null;
}

export function expireModelListCache(): void {
  if (cache) cache.fetchedAt = 0;
}

export async function fetchModelList(): Promise<ModelInfo[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.models;
  }
  try {
    const res = await fetch(OPENROUTER_MODELS_URL, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`OpenRouter returned HTTP ${res.status}`);
    const data: unknown = await res.json();
    const models = parseModelList(data);
    cache = { fetchedAt: Date.now(), models };
    return models;
  } catch {
    if (cache) return cache.models;
    throw new HttpError(
      502,
      "MODELS_UNAVAILABLE",
      "Could not fetch the model list from OpenRouter.",
    );
  }
}

export function parseModelList(data: unknown): ModelInfo[] {
  const entries = (data as { data?: unknown } | null)?.data;
  if (!Array.isArray(entries)) {
    throw new Error("Model list response has no data array.");
  }
  const models: ModelInfo[] = [];
  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as {
      id?: unknown;
      name?: unknown;
      pricing?: { prompt?: unknown; completion?: unknown };
      architecture?: { modality?: unknown; output_modalities?: unknown };
    };
    if (typeof record.id !== "string" || record.id.length === 0) continue;
    if (!outputsText(record.architecture)) continue;
    models.push({
      id: record.id,
      name: typeof record.name === "string" && record.name.length > 0 ? record.name : record.id,
      promptPrice: parsePrice(record.pricing?.prompt),
      completionPrice: parsePrice(record.pricing?.completion),
    });
  }
  models.sort((a, b) => a.id.localeCompare(b.id));
  return models;
}

/* Only text-output models can run the pipeline; when the catalog entry
 * doesn't say (older/unknown shape), keep it rather than hiding it. */
function outputsText(arch?: { modality?: unknown; output_modalities?: unknown }): boolean {
  if (!arch) return true;
  if (Array.isArray(arch.output_modalities)) {
    return arch.output_modalities.includes("text");
  }
  if (typeof arch.modality === "string") {
    return arch.modality.endsWith("->text");
  }
  return true;
}

function parsePrice(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
