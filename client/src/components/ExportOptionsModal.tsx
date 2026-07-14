import { Button } from "./Button";

export interface ExportOptionsModalProps {
  hasSavedReview: boolean;
  onViewSavedReview: () => void;
  onRunReviewAndExport: () => void;
  onExportImmediately: () => void;
  onClose: () => void;
}

export function ExportOptionsModal({
  hasSavedReview,
  onViewSavedReview,
  onRunReviewAndExport,
  onExportImmediately,
  onClose,
}: ExportOptionsModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="max-h-[90dvh] w-full max-w-[490px] overflow-auto rounded-xl border border-line-400 bg-white p-4 sm:p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-line-200 pb-3">
          <h3 className="font-display text-[17px] font-semibold text-ink-950">
            Export Document
          </h3>
          <button
            onClick={onClose}
            className="cursor-pointer text-xs font-bold text-ink-400 hover:text-ink-950"
          >
            ✕
          </button>
        </div>

        <p className="text-[13px] text-ink-600 leading-normal">
          Choose how you would like to export your Product Requirements Document:
        </p>

        <div className="space-y-3">
          {hasSavedReview && (
            <button
              onClick={onViewSavedReview}
              className="w-full text-left p-4 rounded-lg border border-accent/40 bg-accent-tint/50 hover:bg-accent-tint/90 transition-colors duration-150 group cursor-pointer"
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent flex-none">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                  <span className="font-semibold text-[14px] text-accent-strong group-hover:text-accent">
                    View Saved Review Results
                  </span>
                </div>
                <span className="text-xs text-accent font-mono font-medium">Saved</span>
              </div>
              <p className="text-[12.5px] text-ink-600 leading-normal">
                Re-open your previous review findings and applied fixes without waiting for an LLM pass.
              </p>
            </button>
          )}

          <button
            onClick={onRunReviewAndExport}
            className={`w-full text-left p-4 rounded-lg border transition-colors duration-150 group cursor-pointer ${
              hasSavedReview
                ? "border-line-300 bg-paper-tint hover:bg-ink-950/4"
                : "border-accent/30 bg-accent-tint/40 hover:bg-accent-tint/80"
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`${hasSavedReview ? "text-ink-600" : "text-accent"} flex-none`}>
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
                <span className={`font-semibold text-[14px] ${hasSavedReview ? "text-ink-950" : "text-accent-strong group-hover:text-accent"}`}>
                  {hasSavedReview ? "Re-run Fresh Review & Export" : "Run Final Review & Export"}
                </span>
              </div>
              {!hasSavedReview && (
                <span className="text-xs text-accent font-mono">Recommended</span>
              )}
            </div>
            <p className="text-[12.5px] text-ink-600 leading-normal">
              {hasSavedReview
                ? "Run a new lead software engineer review pass to evaluate your latest document changes."
                : "Simulates a lead software engineer review to identify implementation risks, edge cases, and ambiguities before exporting."}
            </p>
          </button>

          <button
            onClick={onExportImmediately}
            className="w-full text-left p-4 rounded-lg border border-line-300 bg-paper-tint hover:bg-ink-950/4 transition-colors duration-150 group cursor-pointer"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-600 flex-none">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              <span className="font-semibold text-[14px] text-ink-950">
                Export Immediately
              </span>
            </div>
            <p className="text-[12.5px] text-ink-500 leading-normal">
              Download the current document as Markdown right now without running a final review.
            </p>
          </button>
        </div>

        <div className="flex justify-end pt-2 border-t border-line-200">
          <Button variant="neutral" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
