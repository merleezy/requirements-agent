import { useEffect, useMemo, useState } from "react";
import {
  fetchModelCatalog,
  fetchModelConfig,
  sameModelConfig,
  saveModelConfig,
  type ModelCatalog,
  type ModelConfig,
  type ModelInfo,
  type ModelPreset,
  type Stage,
} from "../state/settings";
import { Button } from "./Button";
import { SectionHeading } from "./SectionHeading";
import { Wordmark } from "./Wordmark";

/*
 * Build-order step 8: per-stage model dropdowns plus the Budget/Balanced/
 * Max-quality presets. No design reference exists for this page; it
 * extrapolates the same card language as the home page and clarify view.
 *
 * The catalog (OpenRouter's /models list) and the session's current config
 * load independently: the config is required to render anything, but a
 * failed catalog only degrades the dropdowns to their current values.
 * Saving is explicit (spec: "Saving writes to this config object in session
 * state"); a preset click only fills the dropdowns until saved.
 */

interface StageRow {
  stage: Stage;
  label: string;
  description: string;
}

const stageRows: StageRow[] = [
  {
    stage: "clarify",
    label: "Clarify",
    description: "Finds ambiguities in your idea and asks the questions - a fast model is plenty.",
  },
  {
    stage: "draft",
    label: "Draft",
    description: "Writes the structured PRD - the strongest lever on document quality.",
  },
  {
    stage: "critic",
    label: "Critic",
    description: "Checks each requirement against the rubric, one flag at a time.",
  },
  {
    stage: "revise_local",
    label: "Revise (local)",
    description: "Resolves one flagged requirement from your feedback.",
  },
  {
    stage: "revise_global",
    label: "Revise (global)",
    description: "Applies whole-document feedback from the chat panel.",
  },
];

/* "Anthropic: Claude Opus 4.8" reads redundantly inside an "anthropic"
 * optgroup, so drop the provider prefix OpenRouter puts on model names. */
function optionLabel(model: ModelInfo): string {
  return model.name.replace(/^[^:]{1,40}: /, "");
}

/* Per-token USD -> the "per 1M tokens" figure people actually compare. */
function formatPerMillion(perToken: number): string {
  const perMillion = perToken * 1e6;
  const digits = perMillion >= 100 ? 0 : perMillion >= 10 ? 1 : 2;
  return `$${perMillion.toFixed(digits)}`;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface SettingsPageProps {
  onBack: () => void;
}

export function SettingsPage({ onBack }: SettingsPageProps) {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [config, setConfig] = useState<ModelConfig | null>(null);
  const [savedConfig, setSavedConfig] = useState<ModelConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setConfigError(null);
    fetchModelConfig().then(
      (c) => {
        if (cancelled) return;
        setConfig(c);
        setSavedConfig(c);
      },
      (err: unknown) => {
        if (!cancelled) setConfigError(errorText(err));
      },
    );
    fetchModelCatalog().then(
      (c) => {
        if (!cancelled) setCatalog(c);
      },
      (err: unknown) => {
        if (!cancelled) setCatalogError(errorText(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  /* The catalog arrives sorted by id, so groups stay sorted within. */
  const providerGroups = useMemo(() => {
    if (!catalog) return [];
    const byProvider = new Map<string, ModelInfo[]>();
    for (const model of catalog.models) {
      const provider = model.id.includes("/") ? model.id.split("/", 1)[0] : "other";
      const group = byProvider.get(provider);
      if (group) group.push(model);
      else byProvider.set(provider, [model]);
    }
    return [...byProvider.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [catalog]);

  const modelById = useMemo(
    () => new Map((catalog?.models ?? []).map((m) => [m.id, m])),
    [catalog],
  );

  const dirty = config !== null && savedConfig !== null && !sameModelConfig(config, savedConfig);

  const setStageModel = (stage: Stage, model: string) => {
    setConfig((c) => (c ? { ...c, [stage]: { model } } : c));
    setJustSaved(false);
    setSaveError(null);
  };

  const applyPreset = (preset: ModelPreset) => {
    setConfig(structuredClone(preset.config));
    setJustSaved(false);
    setSaveError(null);
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveModelConfig(config);
      setSavedConfig(config);
      setJustSaved(true);
    } catch (err) {
      setSaveError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const status = saveError ? (
    <div className="min-w-0 font-mono text-[10.5px] font-medium text-defect">{saveError}</div>
  ) : catalogError ? (
    <div className="min-w-0 font-mono text-[10.5px] font-medium text-defect">
      Couldn&rsquo;t load the OpenRouter model list - dropdowns show current values only.
    </div>
  ) : saving ? (
    <div className="min-w-0 font-mono text-[10.5px] font-medium text-ink-400">Saving…</div>
  ) : dirty ? (
    <div className="min-w-0 font-mono text-[10.5px] font-medium text-ink-400">
      Unsaved changes - nothing applies until you save
    </div>
  ) : justSaved ? (
    <div className="min-w-0 font-mono text-[10.5px] font-medium text-accent">
      Saved - the pipeline now runs on these models
    </div>
  ) : (
    <div className="min-w-0 font-mono text-[10.5px] font-medium text-ink-400">
      Applies to this session only · your API key is never stored
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto px-[34px] pt-[64px] pb-[90px]">
      <div className="w-full max-w-[640px]">
        <div className="flex items-start justify-between">
          <Wordmark />
          <button
            type="button"
            onClick={onBack}
            className="flex h-[26px] cursor-pointer items-center font-mono text-[10.5px] font-medium text-ink-500 hover:text-ink-950"
          >
            &larr; Back
          </button>
        </div>

        <div className="overflow-hidden rounded-lg border border-line-400 bg-paper shadow-doc">
          {/* Masthead */}
          <div className="border-b border-line-200 bg-paper-tint px-10 pt-8 pb-6">
            <div className="mb-[9px] font-mono text-[10px] font-medium tracking-[0.16em] text-ink-400 uppercase">
              Settings
            </div>
            <div className="font-display text-[27px] leading-[1.15] font-bold tracking-[-0.015em] text-ink-950">
              Model settings
            </div>
            <div className="mt-1.5 text-[13.5px] leading-[1.5] text-ink-500">
              Each pipeline stage reads its model from here. Apply a preset or pick per stage -
              the list comes straight from OpenRouter, so anything your key can call is available.
            </div>
          </div>

          {configError ? (
            <div className="px-10 py-6">
              <div className="font-mono text-[10.5px] font-medium text-defect">
                Couldn&rsquo;t load your current settings ({configError}).
              </div>
              <Button
                variant="neutral"
                className="mt-3"
                onClick={() => setLoadAttempt((n) => n + 1)}
              >
                Retry
              </Button>
            </div>
          ) : config === null ? (
            <div className="px-10 py-6 font-mono text-[10.5px] font-medium text-ink-400">
              Loading model settings…
            </div>
          ) : (
            <>
              {/* Presets */}
              <div className="border-b border-line-100 px-10 pt-5 pb-6">
                <SectionHeading number="01" title="Presets" />
                <div className="mt-3.5 grid grid-cols-3 gap-2.5">
                  {(catalog?.presets ?? []).map((preset) => {
                    const selected = sameModelConfig(config, preset.config);
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyPreset(preset)}
                        className={`cursor-pointer rounded-lg border p-3 text-left transition-colors ${
                          selected
                            ? "border-accent-line bg-accent-tint"
                            : "border-line-400 bg-white hover:border-line-600"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-display text-[13px] font-semibold text-ink-950">
                            {preset.name}
                          </span>
                          {selected && (
                            <span className="font-mono text-[9px] font-semibold tracking-[0.08em] text-accent uppercase">
                              Selected
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-[11.5px] leading-[1.45] text-ink-500">
                          {preset.description}
                        </div>
                      </button>
                    );
                  })}
                  {catalog === null && !catalogError && (
                    <div className="col-span-3 font-mono text-[10.5px] font-medium text-ink-400">
                      Loading presets…
                    </div>
                  )}
                  {catalogError && (
                    <div className="col-span-3 font-mono text-[10.5px] font-medium text-ink-400">
                      Presets are unavailable while the model list can&rsquo;t be loaded.
                    </div>
                  )}
                </div>
              </div>

              {/* Per-stage models */}
              <div className="px-10 pt-5 pb-2.5">
                <SectionHeading number="02" title="Stage models" />
                <div className="mt-1">
                  {stageRows.map((row, i) => {
                    const current = config[row.stage].model;
                    const known = modelById.get(current);
                    return (
                      <div
                        key={row.stage}
                        className={`flex items-start justify-between gap-6 py-3.5 ${
                          i < stageRows.length - 1 ? "border-b border-line-100" : ""
                        }`}
                      >
                        <div className="min-w-0 pt-1">
                          <div className="text-[13.5px] leading-[1.4] font-medium text-ink-950">
                            {row.label}
                          </div>
                          <div className="mt-0.5 text-[12px] leading-[1.5] text-ink-400">
                            {row.description}
                          </div>
                        </div>
                        <div className="w-[250px] flex-none">
                          <select
                            value={current}
                            onChange={(e) => setStageModel(row.stage, e.target.value)}
                            className="w-full cursor-pointer rounded-lg border border-line-400 bg-white px-3 py-2 font-mono text-[11.5px] text-ink-950 outline-none focus:border-accent"
                          >
                            {!known && <option value={current}>{current}</option>}
                            {providerGroups.map(([provider, models]) => (
                              <optgroup key={provider} label={provider}>
                                {models.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {optionLabel(m)}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                          <div className="mt-1 truncate text-right font-mono text-[10px] text-ink-300">
                            {known
                              ? known.promptPrice !== null && known.completionPrice !== null
                                ? `${formatPerMillion(known.promptPrice)} in · ${formatPerMillion(known.completionPrice)} out / 1M tokens`
                                : known.id
                              : catalog
                                ? `${current} · not in the current OpenRouter list`
                                : current}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between gap-4 border-t border-line-200 bg-paper-tint px-10 py-4">
            {status}
            <Button
              variant="solid"
              size="post"
              className="flex-none"
              disabled={config === null || !dirty || saving}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save settings"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
