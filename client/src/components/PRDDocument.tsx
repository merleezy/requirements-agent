import type { ReactNode } from "react";
import type { Comment, PRD, PrdItem } from "../types";
import { CommentThread } from "./CommentThread";
import { RequirementRow } from "./RequirementRow";
import type { FlagActions } from "./RequirementRow";
import { SectionHeading } from "./SectionHeading";

/*
 * The PRD document card: masthead plus the six fixed sections from the spec,
 * each annotatable. Layout and type per the design reference.
 */

interface PRDDocumentProps extends FlagActions {
  prd: PRD;
  comments: Record<string, Comment[]>;
  onAddComment: (targetId: string, text: string) => void;
  /* Ids of requirements with a revise-local call currently in flight - more
   * than one can be in flight at once, each independent of the others. */
  revisingIds: ReadonlySet<string>;
  /* Last "unresolved" message per requirement id, from a feedback attempt
   * the agent couldn't resolve. */
  unresolvedMessages: Record<string, string>;
  /* True while a critic pass is in flight. */
  reviewing?: boolean;
}

function Section({
  number,
  title,
  children,
  caption,
  last = false,
}: {
  number: string;
  title: string;
  children: ReactNode;
  caption?: string;
  last?: boolean;
}) {
  return (
    <div className={`px-10 pt-5 ${last ? "pb-6" : "border-b border-line-100 pb-3"}`}>
      <div className="mb-3">
        <SectionHeading number={number} title={title} />
        {caption && (
          <div className="mt-[7px] pl-[26px] font-mono text-[10.5px] tracking-[0.03em] text-ink-300">
            {caption}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function BulletItem({
  item,
  comments,
  onAddComment,
}: {
  item: PrdItem;
  comments: Comment[];
  onAddComment: (targetId: string, text: string) => void;
}) {
  return (
    <div className="pb-3.5">
      <div className="flex gap-[11px] text-[14px] leading-[1.55] text-ink-800">
        <span className="mt-2 h-[5px] w-[5px] flex-none rounded-full bg-ink-100" />
        <span>{item.text}</span>
      </div>
      <div className="mt-[5px] pl-4">
        <CommentThread comments={comments} onSubmit={(text) => onAddComment(item.id, text)} />
      </div>
    </div>
  );
}

export function PRDDocument({
  prd,
  comments,
  onAddComment,
  onAcceptRewrite,
  onSubmitFeedback,
  onConfirmJudgment,
  onMoveToOutOfScope,
  revisingIds,
  unresolvedMessages,
  reviewing = false,
}: PRDDocumentProps) {
  const commentsFor = (id: string) => comments[id] ?? [];

  return (
    <div className="w-full max-w-[740px]">
      {reviewing && (
        <div className="sticky top-0 z-20 mb-3.5 flex items-center justify-between rounded-lg border border-accent-line bg-accent-tint px-4 py-2.5 text-[13px] text-accent-strong shadow-md animate-pulse backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <span className="flex h-2 w-2 rounded-full bg-accent animate-ping" />
            <span className="font-medium">Critic agent is actively evaluating requirements against the rubric…</span>
          </div>
          <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-accent">
            Reviewing
          </span>
        </div>
      )}
      <div className="w-full max-w-[740px] overflow-hidden rounded-lg border border-line-400 bg-paper shadow-doc">
        {/* Masthead */}
        <div className="border-b border-line-200 bg-paper-tint px-10 pt-8 pb-6">
          <div className="mb-[9px] font-mono text-[10px] font-medium tracking-[0.16em] text-ink-400 uppercase">
            Product Requirements Document
          </div>
          <div className="font-display text-[27px] leading-[1.15] font-bold tracking-[-0.015em] text-ink-950">
            {prd.title}
          </div>
          <div className="mt-1.5 text-[13.5px] leading-[1.5] text-ink-500">{prd.subtitle}</div>
        </div>

        <Section number="01" title="Problem Statement">
          <div className="text-[14px] leading-[1.6] text-ink-800">{prd.problemStatement.text}</div>
          <div className="mt-2 pb-2">
            <CommentThread
              comments={commentsFor(prd.problemStatement.id)}
              onSubmit={(text) => onAddComment(prd.problemStatement.id, text)}
            />
          </div>
        </Section>

        <Section number="02" title="Target Users">
          {prd.targetUsers.map((item) => (
            <BulletItem
              key={item.id}
              item={item}
              comments={commentsFor(item.id)}
              onAddComment={onAddComment}
            />
          ))}
        </Section>

        <Section number="03" title="Goals">
          {prd.goals.map((item) => (
            <BulletItem
              key={item.id}
              item={item}
              comments={commentsFor(item.id)}
              onAddComment={onAddComment}
            />
          ))}
        </Section>

        <Section
          number="04"
          title="Functional Requirements"
          caption={reviewing ? "Critic reviewing requirements inline…" : "Critic rubric · unambiguous · atomic · testable · scoped · traceable"}
        >
        {prd.functionalRequirements.map((r) => (
          <RequirementRow
            key={r.id}
            requirement={r}
            comments={commentsFor(r.id)}
            onAddComment={onAddComment}
            onAcceptRewrite={onAcceptRewrite}
            onSubmitFeedback={onSubmitFeedback}
            onConfirmJudgment={onConfirmJudgment}
            onMoveToOutOfScope={onMoveToOutOfScope}
            busy={revisingIds.has(r.id)}
            unresolvedMessage={unresolvedMessages[r.id] ?? null}
          />
        ))}
      </Section>

      <Section number="05" title="Out of Scope">
        {prd.outOfScope.map((item) => (
          <BulletItem
            key={item.id}
            item={item}
            comments={commentsFor(item.id)}
            onAddComment={onAddComment}
          />
        ))}
      </Section>

      <Section number="06" title="Open Questions" last>
        {prd.openQuestions.map((item, i) => (
          <div key={item.id} className="pb-3.5">
            <div className="flex gap-[11px] text-[14px] leading-[1.55] text-ink-800">
              <span className="w-6 flex-none font-mono text-[12px] font-semibold text-ink-200">
                Q{i + 1}
              </span>
              <span>{item.text}</span>
            </div>
            <div className="mt-[5px] pl-4">
              <CommentThread
                comments={commentsFor(item.id)}
                onSubmit={(text) => onAddComment(item.id, text)}
              />
            </div>
          </div>
        ))}
      </Section>
    </div>
    </div>
  );
}
