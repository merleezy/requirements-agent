import type { Comment, Requirement } from "../types";
import { Button } from "./Button";
import { CommentThread } from "./CommentThread";
import { DimensionTag } from "./DimensionTag";

/*
 * One functional requirement: ref + text (with the flagged span dotted-
 * underlined), the critic flag callout when present, and a comment thread.
 */

export interface FlagActions {
  onAcceptRewrite: (id: string) => void;
  onDismissFlag: (id: string) => void; /* Decline / Accept as-is */
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
}

export function RequirementRow({
  requirement: r,
  comments,
  onAddComment,
  onAcceptRewrite,
  onDismissFlag,
  onMoveToOutOfScope,
}: RequirementRowProps) {
  const flag = r.flag;
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
          {flag.nature === "defect" && flag.suggestedRewrite && (
            <>
              <div className="mt-2 text-[13.5px] leading-[1.55] text-ink-950">
                <span className="font-semibold text-accent">Suggested — </span>
                {flag.suggestedRewrite}
              </div>
              <div className="mt-[9px] flex gap-2.5">
                <Button variant="primary" onClick={() => onAcceptRewrite(r.id)}>
                  Accept rewrite
                </Button>
                <Button variant="neutral" onClick={() => onDismissFlag(r.id)}>
                  Decline
                </Button>
              </div>
            </>
          )}
          {flag.nature === "judgment" && (
            <div className="mt-[9px] flex flex-wrap gap-2.5">
              <Button variant="judgment" onClick={() => onDismissFlag(r.id)}>
                Accept as-is anyway
              </Button>
              <Button variant="judgment-outline" onClick={() => onMoveToOutOfScope(r.id)}>
                Move to Out of Scope
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
