import { useState } from "react";
import type { KeyboardEvent } from "react";
import type { ChatMessage } from "../types";
import { Button } from "./Button";

/*
 * Right-hand persistent chat panel for whole-document feedback.
 * Static in step 2: messages append locally; the revise-global agent
 * is wired in at build-order step 7.
 */

interface ChatPanelProps {
  messages: ChatMessage[];
  chips: string[];
  onSend: (text: string) => void;
}

export function ChatPanel({ messages, chips, onSend }: ChatPanelProps) {
  const [draft, setDraft] = useState("");

  const send = (text?: string) => {
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
    <div className="flex min-h-0 w-[360px] flex-none flex-col border-l border-line-500 bg-panel">
      {/* Header */}
      <div className="flex-none border-b border-line-200 bg-paper px-[18px] py-4">
        <div className="flex items-center gap-[9px]">
          <div className="flex h-[26px] w-[26px] items-center justify-center rounded-md bg-accent font-mono text-[10px] font-semibold text-white">
            AI
          </div>
          <div>
            <div className="font-display text-[13px] font-semibold text-ink-950">Draftsmith</div>
            <div className="font-mono text-[10.5px] text-ink-400">whole-document feedback</div>
          </div>
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
              className={`max-w-[255px] px-[13px] py-2.5 text-[13px] leading-[1.55] ${
                m.role === "agent"
                  ? "rounded-[3px_11px_11px_11px] border border-line-200 bg-white text-ink-800"
                  : "rounded-[11px_3px_11px_11px] bg-ink-900 text-ink-inverse"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        <div className="mt-1.5 flex flex-wrap gap-[7px]">
          {chips.map((label) => (
            <button
              key={label}
              onClick={() => send(label)}
              className="cursor-pointer rounded-[14px] border border-line-400 bg-white px-3 py-1.5 text-[11px] font-medium text-ink-800 hover:border-accent hover:text-accent"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="flex-none border-t border-line-200 bg-paper px-3.5 py-3">
        <div className="flex items-end gap-2 rounded-lg border border-line-400 bg-white px-2.5 py-2">
          <textarea
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask, revise the plan, or add something missing…"
            className="max-h-[120px] flex-1 resize-none border-none bg-transparent text-[13px] leading-[1.5] text-ink-950 outline-none"
          />
          <Button variant="solid" size="send" className="flex-none" onClick={() => send()}>
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
