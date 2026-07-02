import { useState } from "react";
import type { ClarificationPair, ClarifyQuestion } from "../state/clarify";
import { Button } from "./Button";
import { Wordmark } from "./Wordmark";

/*
 * Build-order step 6: the clarifying Q&A round-trip between the home page
 * and the drafted document. No design reference exists for this view; it
 * extrapolates the document card's language - paper masthead, mono "Qn"
 * refs like the Open Questions section, ink/line tokens throughout. The
 * list renders comfortably at the prompt's 8-question ceiling because the
 * page scrolls like the document view does.
 *
 * Every answer is optional: a blank input means "skip this question", which
 * travels as an empty answer and surfaces downstream as an open question
 * rather than a guess.
 */

interface ClarifyViewProps {
  round: number; /* 1 or 2 */
  questions: ClarifyQuestion[]; /* the current round's questions */
  /* "check" = round-2 follow-up check in flight, "draft" = drafting. */
  busy: "check" | "draft" | null;
  error: string | null;
  onSubmit: (pairs: ClarificationPair[]) => void;
}

export function ClarifyView({ round, questions, busy, error, onSubmit }: ClarifyViewProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const submit = () =>
    onSubmit(
      questions.map((q) => ({
        question: q.question,
        answer: (answers[q.id] ?? "").trim(),
      })),
    );

  return (
    <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto px-[34px] pt-[64px] pb-[90px]">
      <div className="w-full max-w-[640px]">
        <Wordmark />

        <div className="overflow-hidden rounded-lg border border-line-400 bg-paper shadow-doc">
          {/* Masthead */}
          <div className="border-b border-line-200 bg-paper-tint px-10 pt-8 pb-6">
            <div className="mb-[9px] font-mono text-[10px] font-medium tracking-[0.16em] text-ink-400 uppercase">
              {round === 1 ? "Clarifying Questions" : "Clarifying Questions · Round 2"}
            </div>
            <div className="font-display text-[27px] leading-[1.15] font-bold tracking-[-0.015em] text-ink-950">
              {round === 1 ? "A few questions before drafting" : "A couple of follow-ups"}
            </div>
            <div className="mt-1.5 text-[13.5px] leading-[1.5] text-ink-500">
              {round === 1
                ? "Your idea leaves a few real decisions open. A sentence per answer is plenty - skip anything you're unsure about and it stays an open question in the draft instead of a guess."
                : "Your answers surfaced something new. Same rules - one sentence each, skipping is fine."}
            </div>
          </div>

          {/* Questions */}
          <div className="px-10 pt-5 pb-6">
            {questions.map((q, i) => (
              <div
                key={q.id}
                className={i < questions.length - 1 ? "border-b border-line-100 py-4" : "pt-4 pb-1"}
              >
                <div className="flex gap-[11px]">
                  <span className="mt-px w-6 flex-none font-mono text-[12px] font-semibold text-ink-200">
                    Q{i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] leading-[1.55] font-medium text-ink-950">
                      {q.question}
                    </div>
                    <div className="mt-1 text-[12px] leading-[1.5] text-ink-400">
                      {q.whyItMatters}
                    </div>
                    <input
                      type="text"
                      value={answers[q.id] ?? ""}
                      onChange={(e) =>
                        setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
                      }
                      placeholder="One sentence - or leave blank to skip"
                      className="mt-2.5 w-full rounded-lg border border-line-400 bg-white px-3.5 py-2.5 text-[13.5px] leading-[1.5] text-ink-950 outline-none placeholder:text-ink-300 focus:border-accent"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-4 border-t border-line-200 bg-paper-tint px-10 py-4">
            {error ? (
              <div className="min-w-0 font-mono text-[10.5px] font-medium text-defect">{error}</div>
            ) : busy === "check" ? (
              <div className="min-w-0 font-mono text-[10.5px] font-medium text-ink-400">
                Checking whether anything else needs clarifying…
              </div>
            ) : busy === "draft" ? (
              <div className="min-w-0 font-mono text-[10.5px] font-medium text-ink-400">
                Draftsmith is writing the first draft - this can take a minute
              </div>
            ) : (
              <div className="min-w-0 font-mono text-[10.5px] font-medium text-ink-400">
                {round === 1
                  ? "Next: Draftsmith may ask one short follow-up round, then drafts the PRD"
                  : "Next: PRD draft - no more questions after this"}
              </div>
            )}
            <Button
              variant="solid"
              size="post"
              className="flex-none"
              disabled={busy !== null}
              onClick={submit}
            >
              {busy === "draft" ? "Drafting…" : "Submit answers"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
