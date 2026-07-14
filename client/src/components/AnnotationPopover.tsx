import { useState, useEffect, useRef } from "react";
import { Button } from "./Button";

export interface AnnotationPopoverProps {
  selectionText: string;
  targetId?: string;
  targetLabel?: string;
  position: { top: number; left: number };
  onClose: () => void;
  onSubmit: (feedback: string, selectionText: string, targetId?: string) => void;
}

export function AnnotationPopover({
  selectionText,
  targetLabel,
  targetId,
  position,
  onClose,
  onSubmit,
}: AnnotationPopoverProps) {
  const [comment, setComment] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const handleSubmit = () => {
    const text = comment.trim();
    if (!text) return;
    onSubmit(text, selectionText, targetId);
    setComment("");
    onClose();
  };

  return (
    <div
      ref={popoverRef}
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
      className="fixed z-50 w-80 max-w-[calc(100vw-20px)] rounded-xl border border-line-400 bg-white p-3.5 shadow-xl transition-all"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-accent">
          {targetLabel ? `Annotate ${targetLabel}` : "Annotate selection"}
        </span>
        <button
          onClick={onClose}
          className="cursor-pointer text-xs font-bold text-ink-400 hover:text-ink-950"
        >
          ✕
        </button>
      </div>

      {selectionText && (
        <div className="mb-2.5 max-h-16 overflow-auto rounded border-l-2 border-accent bg-paper-tint px-2.5 py-1.5 font-mono text-[11.5px] leading-tight text-ink-700 italic">
          "{selectionText}"
        </div>
      )}

      <textarea
        autoFocus
        rows={2}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        placeholder="Request a revision or add notes…"
        className="w-full resize-none rounded-lg border border-line-300 bg-white p-2 text-[12.5px] text-ink-950 outline-none placeholder:text-ink-400 focus:border-accent"
      />

      <div className="mt-2.5 flex justify-end gap-2">
        <Button variant="neutral" size="post" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="post"
          disabled={comment.trim().length === 0}
          onClick={handleSubmit}
        >
          Send to Chat
        </Button>
      </div>
    </div>
  );
}
