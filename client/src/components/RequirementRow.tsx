import { useState } from "react";
import type { Comment, Requirement } from "../types";
import { Button } from "./Button";
import { CommentThread } from "./CommentThread";
import { DimensionTag } from "./DimensionTag";

/*
 * One functional requirement: ref + text (with the flagged span dotted-
 * underlined), the critic flag callout when present, and a comment thread.
 *
 * Defect flags (unambiguous/atomic/testable) resolve through the local
 * revise loop: Accept rewrite applies the critic's own suggestion verbatim,
 * and "That's not quite it" opens a feedback box for cases where the
 * suggestion misses what the user actually meant - or where the critic
 * proposed no rewrite at all (an unresolved-ambiguity flag has none by
 * design). Judgment flags (scoped/traceable) never get a rewrite; the user
 * is only confirming intent, so those stay a plain Accept/Move choice.
 */

export interface FlagActions {
  onAcceptRewrite: (id: string) => void;
  onSubmitFeedback: (id: string, feedback: string) => void;
  onConfirmJudgment: (id: string) => void; /* Accept as-is anyway (judgment only) */
  onMoveToOutOfScope: (id: string) => void;
}

function HighlightedText({ text, highlight, nature }: {
  text: string;
  highlight: string | null;
  nature: "defect" | "judgment" | null;
}) {
  if (!highlight || !nature) return <span>{text}</span>;
  const start = text.indexOf(highlight);
  if (start === -1) return <span>{text}</span>;
  const underline =
    nature === "defect" ? "border-defect-underline" : "border-judgment-underline";
  return (
    <span>
      {text.slice(0, start)}
      <span className={`border-b-2 border-dotted pb-px ${underline}`}>{highlight}</span>
      {text.slice(start + highlight.length)}
    </span>
  );
}

interface RequirementRowProps extends FlagActions {
  requirement: Requirement;
  comments: Comment[];
  onAddComment: (targetId: string, text: string) => void;
  /* True while this row's revise-local call is in flight. */
  busy?: boolean;
  /* Set when the last feedback submission couldn't be resolved (the
   * revise-local agent's "unresolved" field) - the flag is unchanged. */
  unresolvedMessage?: string | null;
}

export function RequirementRow({
  requirement: r,
  comments,
  onAddComment,
  onAcceptRewrite,
  onSubmitFeedback,
  onConfirmJudgment,
  onMoveToOutOfScope,
  busy = false,
  unresolvedMessage = null,
}: RequirementRowProps) {
  const flag = r.flag;
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState("");

  const submitFeedback = () => {
    const text = feedback.trim();
    if (!text) return;
    onSubmitFeedback(r.id, text);
    setFeedback("");
  };

  return (
    <div className="border-b border-line-100 py-3.5">
      <div className="flex gap-[11px] text-[14px] leading-[1.6] text-ink-950">
        <span className="mt-px w-[66px] flex-none font-mono text-[11px] font-semibold text-ink-500">
          {r.ref}
        </span>
        <HighlightedText
          text={r.text}
          highlight={r.highlight}
          nature={flag ? flag.nature : null}
        />
      </div>

      {flag && (
        <div
          className={`mt-2.5 mb-0.5 ml-[78px] max-w-[560px] border-l-2 pl-3.5 ${
            flag.nature === "defect" ? "border-defect" : "border-judgment"
          }`}
        >
          <div className="flex flex-wrap items-baseline gap-[9px]">
            <DimensionTag nature={flag.nature}>{flag.dimension}</DimensionTag>
            <span className="text-[13px] leading-[1.55] text-ink-600">{flag.reason}</span>
          </div>
          {flag.nature === "defect" && (
            <>
              {flag.suggestedRewrite && (
                <div className="mt-2 text-[13.5px] leading-[1.55] text-ink-950">
                  <span className="font-semibold text-accent">Suggested — </span>
                  {flag.suggestedRewrite}
                </div>
              )}
              <div className="mt-[9px] flex flex-wrap gap-2.5">
                {flag.suggestedRewrite && (
                  <Button
                    variant="primary"
                    disabled={busy}
                    onClick={() => onAcceptRewrite(r.id)}
                  >
                    {busy ? "Applying…" : "Accept rewrite"}
                  </Button>
                )}
                <Button
                  variant="neutral"
                  disabled={busy}
                  onClick={() => setFeedbackOpen((v) => !v)}
                >
                  {flag.suggestedRewrite ? "That's not quite it" : "Explain what I meant"}
                </Button>
              </div>
              {feedbackOpen && (
                <div className="mt-2.5">
                  <textarea
                    rows={2}
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="What should this actually say?"
                    className="w-full resize-none rounded-lg border border-line-400 bg-white px-3 py-2 text-[13px] leading-[1.5] text-ink-950 outline-none placeholder:text-ink-300 focus:border-accent"
                  />
                  <div className="mt-2">
                    <Button
                      variant="primary"
                      size="post"
                      disabled={busy || feedback.trim().length === 0}
                      onClick={submitFeedback}
                    >
                      {busy ? "Revising…" : "Submit feedback"}
                    </Button>
                  </div>
                </div>
              )}
              {unresolvedMessage && (
                <div className="mt-2 text-[12.5px] leading-[1.5] text-defect">
                  Draftsmith: {unresolvedMessage}
                </div>
              )}
            </>
          )}
          {flag.nature === "judgment" && (
            <div className="mt-[9px] flex flex-wrap gap-2.5">
              <Button variant="judgment" disabled={busy} onClick={() => onConfirmJudgment(r.id)}>
                {busy ? "Confirming…" : "Accept as-is anyway"}
              </Button>
              <Button
                variant="judgment-outline"
                disabled={busy}
                onClick={() => onMoveToOutOfScope(r.id)}
              >
                {busy ? "Moving…" : "Move to Out of Scope"}
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="mt-2 pl-[78px]">
        <CommentThread comments={comments} onSubmit={(text) => onAddComment(r.id, text)} />
      </div>
    </div>
  );
}
