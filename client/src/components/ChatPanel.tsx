import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { ChatChip } from "../state/chips";
import type { ChatMessage } from "../types";
import { Button } from "./Button";

/*
 * Right-hand persistent chat panel for whole-document feedback. Sending runs
 * the revise-global loop (step 9); while `busy`, a transient "revising"
 * bubble shows and the input is disabled. Chips send a fuller message than
 * their label through the same path.
 */

interface ChatPanelProps {
  messages: ChatMessage[];
  chips: ChatChip[];
  busy: boolean;
  onSend: (text: string) => void;
  /* Closes the mobile drawer; the close button only renders below lg. */
  onClose?: () => void;
}

export function ChatPanel({ messages, chips, busy, onSend, onClose }: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  /* Scroll the newest message (or the pending bubble) into view - real
   * replies arrive after a round trip, so the user must always see them. */
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);

  const send = (text?: string) => {
    if (busy) return;
    const t = (text ?? draft).trim();
    if (!t) return;
    onSend(t);
    if (text === undefined) setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex min-h-0 w-full flex-col border-l border-line-500 bg-panel lg:w-[360px] lg:flex-none">
      {/* Header */}
      <div className="flex-none border-b border-line-200 bg-paper px-[18px] py-4">
        <div className="flex items-center gap-[9px]">
          <div className="flex h-[26px] w-[26px] items-center justify-center rounded-md bg-accent font-mono text-[10px] font-semibold text-white">
            AI
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[13px] font-semibold text-ink-950">Draftsmith</div>
            <div className="font-mono text-[10.5px] text-ink-400">whole-document feedback</div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close chat"
              className="flex h-8 w-8 flex-none cursor-pointer items-center justify-center rounded-md text-xs font-bold text-ink-400 hover:text-ink-950 lg:hidden"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="min-h-0 flex-1 overflow-auto px-[18px] py-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`mb-4 flex items-start gap-[9px] ${m.role === "user" ? "justify-end" : ""}`}
          >
            {m.role === "agent" && (
              <div className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-[5px] bg-accent font-mono text-[9px] font-semibold text-white">
                AI
              </div>
            )}
            <div
              className={`max-w-[80%] px-[13px] lg:max-w-[255px] py-2.5 text-[13px] leading-[1.55] ${
                m.role === "agent"
                  ? "rounded-[3px_11px_11px_11px] border border-line-200 bg-white text-ink-800"
                  : "rounded-[11px_3px_11px_11px] bg-ink-900 text-ink-inverse"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {busy && (
          <div className="mb-4 flex items-start gap-[9px]">
            <div className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-[5px] bg-accent font-mono text-[9px] font-semibold text-white">
              AI
            </div>
            <div className="max-w-[80%] animate-pulse lg:max-w-[255px] rounded-[3px_11px_11px_11px] border border-line-200 bg-white px-[13px] py-2.5 text-[13px] leading-[1.55] text-ink-400">
              Draftsmith is revising the document…
            </div>
          </div>
        )}
        <div className="mt-1.5 flex flex-col gap-2">
          {chips.map((chip) => (
            <button
              key={chip.label}
              onClick={() => send(chip.message)}
              disabled={busy}
              className="cursor-pointer rounded-lg border border-line-400 bg-white px-3 py-2 text-left font-sans text-[11.5px] leading-[1.45] text-ink-800 transition-colors hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-45 break-words"
            >
              {chip.label}
            </button>
          ))}
        </div>
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-none border-t border-line-200 bg-paper px-3.5 py-3">
        <div className="flex items-end gap-2 rounded-lg border border-line-400 bg-white px-2.5 py-2">
          <textarea
            rows={1}
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask, revise the plan, or add something missing…"
            className="max-h-[120px] flex-1 resize-none border-none bg-transparent text-[16px] sm:text-[13px] leading-[1.5] text-ink-950 outline-none disabled:opacity-45"
          />
          <Button
            variant="solid"
            size="send"
            className="flex-none"
            disabled={busy}
            onClick={() => send()}
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
