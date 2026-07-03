import { useState } from "react";
import { Button } from "./Button";

export interface FinalReviewIssue {
  id: string;
  severity: "high" | "medium" | "low";
  /* Optional because results parsed by older server versions lack them. */
  type?: "spec_defect" | "product_question";
  confidence?: "certain" | "inferred";
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
  appliedIssueIds: Set<string>;
  dismissedIssueIds: Set<string>;
  revisingIssueId: string | null;
  onApplyAllAiFixes: () => void;
  onApplySingleAiFix: (issue: FinalReviewIssue) => void;
  onDismissIssue: (issueId: string) => void;
  onRespondToIssue: (issue: FinalReviewIssue, userThoughts: string) => void;
  onReRunReview: () => void;
  onStopActiveProcess: () => void;
  onExportAnyway: () => void;
  onCancel: () => void;
}

function IssueCard({
  issue,
  isRevising,
  onApplySingleAiFix,
  onDismissIssue,
  onRespondToIssue,
}: {
  issue: FinalReviewIssue;
  isRevising: boolean;
  onApplySingleAiFix: (issue: FinalReviewIssue) => void;
  onDismissIssue: (issueId: string) => void;
  onRespondToIssue: (issue: FinalReviewIssue, userThoughts: string) => void;
}) {
  const [respondOpen, setRespondOpen] = useState(false);
  const [thoughts, setThoughts] = useState("");

  const handleSendResponse = () => {
    const text = thoughts.trim();
    if (!text) return;
    onRespondToIssue(issue, text);
    setThoughts("");
    setRespondOpen(false);
  };

  return (
    <div className="rounded-lg border border-line-300 bg-white p-4 shadow-sm space-y-2.5 transition-all">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-bold text-ink-400">{issue.id}</span>
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-600">
            {issue.category}
          </span>
          {issue.type === "product_question" && (
            <span className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider bg-paper-tint text-ink-600 border border-line-400">
              product question
            </span>
          )}
          {issue.confidence === "inferred" && (
            <span className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider bg-paper-tint text-ink-500 border border-line-300">
              inferred
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
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
          <Button
            variant="primary"
            size="post"
            disabled={isRevising}
            onClick={() => onApplySingleAiFix(issue)}
          >
            Apply Fix
          </Button>
          <Button
            variant="neutral"
            size="post"
            disabled={isRevising}
            onClick={() => setRespondOpen((v) => !v)}
          >
            Respond
          </Button>
          <Button
            variant="judgment-outline"
            size="post"
            disabled={isRevising}
            onClick={() => onDismissIssue(issue.id)}
          >
            Dismiss
          </Button>
        </div>
      </div>

      <div className="text-[11.5px] font-mono text-ink-500">Location: {issue.location}</div>

      <div className="text-[13px] leading-normal text-ink-950 font-medium">
        {issue.explanation}
      </div>

      {issue.recommendation && (
        <div className="text-[12.5px] leading-normal text-ink-600 border-l-2 border-accent pl-2.5 mt-1">
          <span className="font-semibold text-accent">Recommendation: </span>
          {issue.recommendation}
        </div>
      )}

      {respondOpen && (
        <div className="mt-3 pt-3 border-t border-line-200 space-y-2">
          <textarea
            rows={2}
            value={thoughts}
            onChange={(e) => setThoughts(e.target.value)}
            placeholder="Explain how to resolve this or provide design intent (e.g. 'Keep non-simplified debts because...')"
            className="w-full resize-none rounded-lg border border-line-400 bg-white px-3 py-2 text-[13px] leading-normal text-ink-950 outline-none placeholder:text-ink-400 focus:border-accent"
          />
          <div className="flex justify-end gap-2">
            <Button variant="neutral" size="post" onClick={() => setRespondOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="post"
              disabled={isRevising || thoughts.trim().length === 0}
              onClick={handleSendResponse}
            >
              Submit Response
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function FinalReviewModal({
  evaluating,
  result,
  appliedIssueIds,
  dismissedIssueIds,
  revisingIssueId,
  onApplyAllAiFixes,
  onApplySingleAiFix,
  onDismissIssue,
  onRespondToIssue,
  onReRunReview,
  onStopActiveProcess,
  onExportAnyway,
  onCancel,
}: FinalReviewModalProps) {
  const issues = result?.issues ?? [];
  const activeIssues = issues.filter(
    (i) => !appliedIssueIds.has(i.id) && !dismissedIssueIds.has(i.id),
  );
  const appliedIssues = issues.filter((i) => appliedIssueIds.has(i.id));
  const dismissedIssues = issues.filter((i) => dismissedIssueIds.has(i.id));

  const isRevising = revisingIssueId !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-[660px] max-h-[88vh] flex flex-col rounded-xl border border-line-400 bg-white p-6 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line-200 pb-4">
          <div className="flex items-center gap-3">
            {evaluating || isRevising ? (
              <span className="flex h-3 w-3 rounded-full bg-accent animate-ping" />
            ) : result?.status === "PASS" || activeIssues.length === 0 ? (
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
                  : isRevising
                    ? "Applying AI Fixes…"
                    : activeIssues.length === 0 && (appliedIssues.length > 0 || dismissedIssues.length > 0)
                      ? "Review Findings Addressed"
                      : result?.status === "PASS"
                        ? "Final Review Passed"
                        : "Final Review Findings"}
              </h3>
              <p className="text-[12.5px] text-ink-500">
                {evaluating
                  ? "Evaluating implementation completeness, edge cases, and technical risks before export."
                  : isRevising
                    ? `Updating PRD document to address ${revisingIssueId === "ALL" ? "all remaining findings" : revisingIssueId}…`
                    : activeIssues.length === 0 && (appliedIssues.length > 0 || dismissedIssues.length > 0)
                      ? `${appliedIssues.length} applied, ${dismissedIssues.length} dismissed. Ready to export.`
                      : result?.status === "PASS"
                        ? activeIssues.length > 0
                          ? `Buildable as written - ${activeIssues.length} non-blocking note${activeIssues.length === 1 ? "" : "s"}.`
                          : "No significant implementation issues were found."
                        : `${activeIssues.length} open finding${activeIssues.length === 1 ? "" : "s"} (${appliedIssues.length} applied, ${dismissedIssues.length} dismissed).`}
              </p>
            </div>
          </div>

          {!evaluating && !isRevising ? (
            <div className="flex items-center gap-2">
              <button
                onClick={onReRunReview}
                title="Re-evaluate document with the review agent"
                className="cursor-pointer text-xs font-mono font-medium text-accent hover:underline px-2.5 py-1 rounded border border-accent/30 bg-accent-tint/30"
              >
                ↻ Re-run Review
              </button>
              <button
                onClick={onCancel}
                className="cursor-pointer text-xs font-bold text-ink-400 hover:text-ink-950 p-1"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="neutral" onClick={onStopActiveProcess}>
                Stop Request
              </Button>
              <button
                onClick={onCancel}
                title="Keep working in the document - the review continues in the background"
                className="cursor-pointer text-xs font-bold text-ink-400 hover:text-ink-950 p-1"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-auto py-4 space-y-4">
          {evaluating ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              <div>
                <p className="text-[14px] font-medium text-ink-800">
                  Simulating senior software engineer review…
                </p>
                <p className="mt-1 text-[12.5px] text-ink-400">
                  Checking for missing edge cases, undefined behavior, and ambiguous requirements.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="neutral" onClick={onCancel}>
                  Continue in Background
                </Button>
                <Button variant="neutral" onClick={onStopActiveProcess}>
                  Cancel Review
                </Button>
              </div>
              <p className="text-[11.5px] text-ink-400">
                You can keep browsing and editing the document - the Export button reopens
                this review when you are ready.
              </p>
            </div>
          ) : isRevising ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              <div>
                <p className="text-[14px] font-medium text-ink-800">
                  Revising PRD document with AI…
                </p>
                <p className="mt-1 text-[12.5px] text-ink-400">
                  {revisingIssueId === "ALL"
                    ? "Modifying sections to address all selected review findings."
                    : `Modifying section to address ${revisingIssueId}.`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="neutral" onClick={onCancel}>
                  Continue in Background
                </Button>
                <Button variant="neutral" onClick={onStopActiveProcess}>
                  Cancel AI Revision
                </Button>
              </div>
            </div>
          ) : activeIssues.length === 0 && (appliedIssues.length > 0 || dismissedIssues.length > 0) ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-accent-line bg-accent-tint p-4 text-[13.5px] text-accent-strong space-y-2">
                <p className="font-semibold text-[14px]">
                  ✓ All review findings have been resolved ({appliedIssues.length} applied, {dismissedIssues.length} dismissed)!
                </p>
                <p className="text-[12.5px] opacity-90 leading-normal">
                  Your PRD is updated. You can re-run the review agent to verify your revised document or export it immediately.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  onClick={onReRunReview}
                  className="flex-1 p-3.5 rounded-lg border border-accent/30 bg-accent-tint/40 hover:bg-accent-tint/80 text-left cursor-pointer transition-colors"
                >
                  <div className="font-semibold text-[13.5px] text-accent-strong mb-1">
                    ↻ Re-run Review to Verify
                  </div>
                  <div className="text-[12px] text-ink-600">
                    Runs a fresh pass on the updated document to confirm all risks are resolved.
                  </div>
                </button>

                <button
                  onClick={onExportAnyway}
                  className="flex-1 p-3.5 rounded-lg border border-line-300 bg-paper-tint hover:bg-ink-950/4 text-left cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2 font-semibold text-[13.5px] text-ink-950 mb-1">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-600 flex-none">
                      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                    Export Document Now
                  </div>
                  <div className="text-[12px] text-ink-500">
                    Download the updated PRD as Markdown immediately.
                  </div>
                </button>
              </div>

              {/* List of Applied Findings */}
              {appliedIssues.length > 0 && (
                <div className="pt-3 border-t border-line-200 space-y-2">
                  <div className="text-[12px] font-mono font-medium text-accent uppercase tracking-wider">
                    Applied Findings Log ({appliedIssues.length})
                  </div>
                  <div className="space-y-2">
                    {appliedIssues.map((issue) => (
                      <div
                        key={issue.id}
                        className="rounded-lg border border-accent-line/40 bg-accent-tint/20 p-3 text-[12.5px]"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono font-bold text-accent text-[11px]">
                            {issue.id} — {issue.category}
                          </span>
                          <span className="text-xs text-accent font-medium">✓ Applied</span>
                        </div>
                        <div className="text-ink-800">{issue.explanation}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* List of Dismissed Findings */}
              {dismissedIssues.length > 0 && (
                <div className="pt-3 border-t border-line-200 space-y-2">
                  <div className="text-[12px] font-mono font-medium text-ink-500 uppercase tracking-wider">
                    Dismissed / Accepted Findings ({dismissedIssues.length})
                  </div>
                  <div className="space-y-2">
                    {dismissedIssues.map((issue) => (
                      <div
                        key={issue.id}
                        className="rounded-lg border border-line-200 bg-paper-tint/60 p-3 text-[12.5px] opacity-75"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono font-semibold text-ink-500 text-[11px]">
                            {issue.id} — {issue.category}
                          </span>
                          <span className="text-xs text-ink-500 font-mono">Dismissed</span>
                        </div>
                        <div className="text-ink-700">{issue.explanation}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : result?.status === "PASS" ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-accent-line bg-accent-tint p-4 text-[13.5px] text-accent-strong space-y-3">
                <p className="font-medium">
                  {result.summary || "The document is complete and ready for development."}
                </p>
                {activeIssues.length > 0 && (
                  <p className="text-[12.5px] opacity-90 leading-normal">
                    The notes below are non-blocking. Apply any that seem worth it, or export
                    the document as is.
                  </p>
                )}
                <div className="pt-2 flex justify-end">
                  <Button variant="primary" onClick={onExportAnyway}>
                    Export Document
                  </Button>
                </div>
              </div>

              {activeIssues.length > 0 && (
                <div className="space-y-3">
                  <div className="text-[12px] font-mono font-medium text-ink-500 uppercase tracking-wider">
                    Non-blocking notes ({activeIssues.length})
                  </div>
                  {activeIssues.map((issue) => (
                    <IssueCard
                      key={issue.id}
                      issue={issue}
                      isRevising={isRevising}
                      onApplySingleAiFix={onApplySingleAiFix}
                      onDismissIssue={onDismissIssue}
                      onRespondToIssue={onRespondToIssue}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {result?.summary && (
                <p className="text-[13.5px] leading-relaxed text-ink-700 bg-paper-tint p-3 rounded-lg border border-line-200">
                  {result.summary}
                </p>
              )}

              {/* Unapplied Findings */}
              <div className="space-y-3">
                {activeIssues.map((issue) => (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    isRevising={isRevising}
                    onApplySingleAiFix={onApplySingleAiFix}
                    onDismissIssue={onDismissIssue}
                    onRespondToIssue={onRespondToIssue}
                  />
                ))}
              </div>

              {/* Applied Findings Section */}
              {appliedIssues.length > 0 && (
                <div className="pt-3 border-t border-line-200 space-y-2">
                  <div className="text-[12px] font-mono font-medium text-accent flex items-center gap-1.5 uppercase tracking-wider">
                    <span>✓ Applied Changes ({appliedIssues.length})</span>
                  </div>
                  <div className="space-y-2">
                    {appliedIssues.map((issue) => (
                      <div
                        key={issue.id}
                        className="rounded-lg border border-accent-line/40 bg-accent-tint/20 p-3 opacity-80 text-[12.5px]"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono font-bold text-accent text-[11px]">
                            {issue.id} — Applied
                          </span>
                          <span className="text-xs text-accent font-medium">✓ Fixed</span>
                        </div>
                        <div className="text-ink-800 line-clamp-2">{issue.explanation}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Dismissed Findings Section */}
              {dismissedIssues.length > 0 && (
                <div className="pt-3 border-t border-line-200 space-y-2">
                  <div className="text-[12px] font-mono font-medium text-ink-500 uppercase tracking-wider">
                    Dismissed Findings ({dismissedIssues.length})
                  </div>
                  <div className="space-y-2">
                    {dismissedIssues.map((issue) => (
                      <div
                        key={issue.id}
                        className="rounded-lg border border-line-200 bg-paper-tint/60 p-3 text-[12.5px] opacity-75"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono font-semibold text-ink-500 text-[11px]">
                            {issue.id} — Dismissed
                          </span>
                          <span className="text-xs text-ink-500 font-mono">Dismissed</span>
                        </div>
                        <div className="text-ink-700 line-clamp-2">{issue.explanation}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {!evaluating && !isRevising && activeIssues.length > 0 && (
          <div className="flex flex-wrap items-center justify-between border-t border-line-200 pt-4 gap-2">
            <div className="text-[11.5px] text-ink-500">
              {result?.status === "PASS"
                ? "Apply notes individually or all at once - none of them block export."
                : "Apply fixes individually, respond with notes, or dismiss findings."}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="neutral" onClick={onCancel}>
                Cancel
              </Button>
              <Button variant="neutral" onClick={onExportAnyway}>
                {result?.status === "PASS" ? "Export" : "Export Anyway"}
              </Button>
              <Button
                variant="primary"
                disabled={isRevising}
                onClick={onApplyAllAiFixes}
              >
                Apply All ({activeIssues.length})
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
