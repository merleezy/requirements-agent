import { Button } from "./Button";

export interface FinalReviewIssue {
  id: string;
  severity: "high" | "medium" | "low";
  category: string;
  location: string;
  explanation: string;
  recommendation: string;
}

export interface FinalReviewResult {
  status: "PASS" | "REQUIRES_CHANGES";
  summary: string;
  issues: FinalReviewIssue[];
}

export interface FinalReviewModalProps {
  evaluating: boolean;
  result: FinalReviewResult | null;
  autoCycleCount: number;
  maxAutoCycles: number;
  onApplyAiFixes: () => void;
  onExportAnyway: () => void;
  onCancel: () => void;
}

export function FinalReviewModal({
  evaluating,
  result,
  autoCycleCount,
  maxAutoCycles,
  onApplyAiFixes,
  onExportAnyway,
  onCancel,
}: FinalReviewModalProps) {
  const canApplyAiFixes = autoCycleCount < maxAutoCycles;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-[640px] max-h-[85vh] flex flex-col rounded-xl border border-line-400 bg-white p-6 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line-200 pb-4">
          <div className="flex items-center gap-3">
            {evaluating ? (
              <span className="flex h-3 w-3 rounded-full bg-accent animate-ping" />
            ) : result?.status === "PASS" ? (
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-tint text-accent font-bold text-sm">
                ✓
              </div>
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-judgment-tint text-judgment font-bold text-sm">
                !
              </div>
            )}
            <div>
              <h3 className="font-display text-[17px] font-semibold text-ink-950">
                {evaluating
                  ? "Lead Engineer Reviewing PRD…"
                  : result?.status === "PASS"
                    ? "Final Review Passed"
                    : "Final Review Findings"}
              </h3>
              <p className="text-[12.5px] text-ink-500">
                {evaluating
                  ? "Evaluating implementation completeness, edge cases, and technical risks before export."
                  : result?.status === "PASS"
                    ? "No significant implementation issues were found."
                    : `${result?.issues.length ?? 0} implementation risk${(result?.issues.length ?? 0) === 1 ? "" : "s"} identified.`}
              </p>
            </div>
          </div>

          {!evaluating && (
            <button
              onClick={onCancel}
              className="cursor-pointer text-xs font-bold text-ink-400 hover:text-ink-950"
            >
              ✕
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-auto py-4">
          {evaluating ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent mb-4" />
              <p className="text-[14px] font-medium text-ink-800">
                Simulating senior software engineer review…
              </p>
              <p className="mt-1 text-[12.5px] text-ink-400">
                Checking for missing edge cases, undefined behavior, and ambiguous requirements.
              </p>
            </div>
          ) : result?.status === "PASS" ? (
            <div className="rounded-lg border border-accent-line bg-accent-tint p-4 text-[13.5px] text-accent-strong">
              <p className="font-medium">{result.summary || "The document is complete and ready for development."}</p>
              <p className="mt-1.5 text-[12.5px] opacity-90">
                Exporting document automatically…
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {result?.summary && (
                <p className="text-[13.5px] leading-relaxed text-ink-700 bg-paper-tint p-3 rounded-lg border border-line-200">
                  {result.summary}
                </p>
              )}

              <div className="space-y-3">
                {result?.issues.map((issue) => (
                  <div
                    key={issue.id}
                    className="rounded-lg border border-line-300 bg-white p-3.5 shadow-sm space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-bold text-ink-400">
                          {issue.id}
                        </span>
                        <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-600">
                          {issue.category}
                        </span>
                      </div>
                      <span
                        className={`rounded px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
                          issue.severity === "high"
                            ? "bg-defect-tint text-defect border border-defect-line"
                            : issue.severity === "medium"
                              ? "bg-judgment-tint text-judgment border border-judgment-line"
                              : "bg-accent-tint text-accent border border-accent-line"
                        }`}
                      >
                        {issue.severity}
                      </span>
                    </div>

                    <div className="text-[11.5px] font-mono text-ink-500">
                      Location: {issue.location}
                    </div>

                    <div className="text-[13px] leading-normal text-ink-950 font-medium">
                      {issue.explanation}
                    </div>

                    {issue.recommendation && (
                      <div className="text-[12.5px] leading-normal text-ink-600 border-l-2 border-accent pl-2.5 mt-1">
                        <span className="font-semibold text-accent">Recommendation: </span>
                        {issue.recommendation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {!evaluating && result?.status === "REQUIRES_CHANGES" && (
          <div className="flex flex-wrap items-center justify-between border-t border-line-200 pt-4 gap-2">
            <div className="text-[11.5px] font-mono text-ink-400">
              {!canApplyAiFixes && "AI cycle limit reached"}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="neutral" onClick={onCancel}>
                Cancel
              </Button>
              <Button variant="neutral" onClick={onExportAnyway}>
                Export Anyway
              </Button>
              <Button
                variant="primary"
                disabled={!canApplyAiFixes}
                onClick={onApplyAiFixes}
              >
                Apply AI Fixes
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
