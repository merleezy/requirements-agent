import { useState, useCallback, type ReactNode } from "react";
import type { PRD, PrdItem } from "../types";
import { AnnotationPopover } from "./AnnotationPopover";
import { RequirementRow } from "./RequirementRow";
import type { FlagActions } from "./RequirementRow";
import { SectionHeading } from "./SectionHeading";

/*
 * The PRD document card: masthead plus the six fixed sections from the spec.
 * Every text item has a hover highlight and click-to-annotate affordance;
 * clicking opens a floating AnnotationPopover that sends comments to the
 * chat panel.
 */

interface PRDDocumentProps extends FlagActions {
  prd: PRD;
  comments: Record<string, unknown>;
  onAddComment: (targetId: string, text: string) => void;
  revisingIds: ReadonlySet<string>;
  unresolvedMessages: Record<string, string>;
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

/* An annotatable text item. Shows a subtle hover highlight and cursor
 * indicator; a single click opens the annotation popover for this item. */
function AnnotatableItem({
  children,
  onClick,
  active,
  className = "",
}: {
  children: ReactNode;
  onClick: (e: React.MouseEvent) => void;
  active: boolean;
  className?: string;
}) {
  return (
    <div
      onClick={onClick}
      className={`group cursor-pointer rounded-md px-1.5 -mx-1.5 transition-colors duration-150 ${
        active
          ? "bg-accent/10 ring-1 ring-accent/30"
          : "hover:bg-ink-950/[0.04]"
      } ${className}`}
    >
      {children}
      {/* Subtle annotation hint on hover */}
      <div className="pointer-events-none flex items-center gap-1.5 overflow-hidden opacity-0 transition-opacity duration-150 group-hover:opacity-100 mt-0.5 mb-0.5 ml-4">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-300 flex-none">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span className="text-[10.5px] text-ink-300 select-none">Click to annotate</span>
      </div>
    </div>
  );
}

function BulletItem({
  item,
  onClick,
  active,
}: {
  item: PrdItem;
  onClick: (e: React.MouseEvent) => void;
  active: boolean;
}) {
  return (
    <AnnotatableItem onClick={onClick} active={active} className="pb-1.5">
      <div className="flex gap-[11px] py-1.5 text-[14px] leading-[1.55] text-ink-800">
        <span className="mt-2 h-[5px] w-[5px] flex-none rounded-full bg-ink-100" />
        <span>{item.text}</span>
      </div>
    </AnnotatableItem>
  );
}

export function PRDDocument({
  prd,
  onAddComment,
  onAcceptRewrite,
  onSubmitFeedback,
  onConfirmJudgment,
  onMoveToOutOfScope,
  onApplySuggestion,
  revisingIds,
  unresolvedMessages,
  reviewing = false,
}: PRDDocumentProps) {
  const [popover, setPopover] = useState<{
    selectionText: string;
    targetId: string;
    targetLabel: string;
    position: { top: number; left: number };
  } | null>(null);

  const openPopover = useCallback(
    (e: React.MouseEvent, targetId: string, targetLabel: string, text: string) => {
      /* Don't open when the user is clicking inside an existing popover or
       * interacting with buttons inside flag action rows. */
      const target = e.target as HTMLElement;
      if (target.closest("button") || target.closest("textarea") || target.closest("input")) return;

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setPopover({
        selectionText: text.length > 120 ? text.slice(0, 120).trimEnd() + "…" : text,
        targetId,
        targetLabel,
        position: {
          top: Math.min(window.innerHeight - 220, Math.max(10, rect.bottom + 6)),
          left: Math.min(window.innerWidth - 340, Math.max(10, rect.left)),
        },
      });
    },
    [],
  );

  const handleAnnotationSubmit = (feedback: string, selectionText: string, targetId?: string) => {
    const snippet = selectionText ? `Re: "${selectionText}"` : "";
    const prefix = targetId ? `[${targetId}] ` : "";
    const text = snippet ? `${prefix}${snippet}: ${feedback}` : `${prefix}${feedback}`;
    onAddComment(targetId ?? "document", text);
  };

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
          <div className="mt-1.5 text-[13.5px] leading-normal text-ink-500">{prd.subtitle}</div>
        </div>

        <Section number="01" title="Problem Statement">
          <AnnotatableItem
            active={popover?.targetId === prd.problemStatement.id}
            onClick={(e) =>
              openPopover(e, prd.problemStatement.id, "Problem Statement", prd.problemStatement.text)
            }
          >
            <div className="pb-2 text-[14px] leading-[1.6] text-ink-800">{prd.problemStatement.text}</div>
          </AnnotatableItem>
        </Section>

        <Section number="02" title="Target Users">
          {prd.targetUsers.map((item) => (
            <BulletItem
              key={item.id}
              item={item}
              active={popover?.targetId === item.id}
              onClick={(e) => openPopover(e, item.id, "Target Users", item.text)}
            />
          ))}
        </Section>

        <Section number="03" title="Goals">
          {prd.goals.map((item) => (
            <BulletItem
              key={item.id}
              item={item}
              active={popover?.targetId === item.id}
              onClick={(e) => openPopover(e, item.id, "Goals", item.text)}
            />
          ))}
        </Section>

        <Section
          number="04"
          title="Functional Requirements"
          caption={reviewing ? "Critic reviewing requirements inline…" : "Critic rubric · unambiguous · atomic · testable · scoped · traceable"}
        >
          {prd.functionalRequirements.map((r) => (
            <AnnotatableItem
              key={r.id}
              active={popover?.targetId === r.id}
              onClick={(e) => openPopover(e, r.id, r.ref, r.text)}
            >
              <RequirementRow
                requirement={r}
                onAcceptRewrite={onAcceptRewrite}
                onSubmitFeedback={onSubmitFeedback}
                onConfirmJudgment={onConfirmJudgment}
                onMoveToOutOfScope={onMoveToOutOfScope}
                onApplySuggestion={onApplySuggestion}
                busy={revisingIds.has(r.id)}
                unresolvedMessage={unresolvedMessages[r.id] ?? null}
              />
            </AnnotatableItem>
          ))}
        </Section>

        <Section number="05" title="Out of Scope">
          {prd.outOfScope.map((item) => (
            <BulletItem
              key={item.id}
              item={item}
              active={popover?.targetId === item.id}
              onClick={(e) => openPopover(e, item.id, "Out of Scope", item.text)}
            />
          ))}
        </Section>

        <Section number="06" title="Open Questions" last>
          {prd.openQuestions.map((item, i) => (
            <AnnotatableItem
              key={item.id}
              active={popover?.targetId === item.id}
              onClick={(e) => openPopover(e, item.id, `Q${i + 1}`, item.text)}
              className="pb-1.5"
            >
              <div className="flex gap-[11px] py-1.5 text-[14px] leading-[1.55] text-ink-800">
                <span className="w-6 flex-none font-mono text-[12px] font-semibold text-ink-200">
                  Q{i + 1}
                </span>
                <span>{item.text}</span>
              </div>
            </AnnotatableItem>
          ))}
        </Section>
      </div>

      {popover && (
        <AnnotationPopover
          selectionText={popover.selectionText}
          targetId={popover.targetId}
          targetLabel={popover.targetLabel}
          position={popover.position}
          onClose={() => setPopover(null)}
          onSubmit={handleAnnotationSubmit}
        />
      )}
    </div>
  );
}
