import { useState } from "react";
import type { KeyboardEvent } from "react";
import type { Comment } from "../types";
import { Button } from "./Button";

/*
 * The "Comment / N comments" toggle plus the inline comment well,
 * per the reference treatment. Open/draft state is local; the comment
 * list and submission are owned by the caller.
 */

function initialsFor(author: string): string {
  if (author === "You") return "You";
  if (author === "Draftsmith") return "AI";
  return author
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function Avatar({ author, role }: { author: string; role: Comment["role"] }) {
  const palette =
    role === "agent"
      ? "bg-accent text-white"
      : author === "You"
        ? "bg-line-400 text-ink-700"
        : "bg-ink-600 text-white";
  return (
    <div
      className={`mt-px flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[5px] font-mono text-[9px] font-semibold ${palette}`}
    >
      {initialsFor(author)}
    </div>
  );
}

interface CommentThreadProps {
  comments: Comment[];
  onSubmit: (text: string) => void;
}

export function CommentThread({ comments, onSubmit }: CommentThreadProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const label =
    comments.length === 0
      ? "Comment"
      : comments.length === 1
        ? "1 comment"
        : `${comments.length} comments`;

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    onSubmit(text);
    setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer text-[11.5px] font-medium text-ink-400 hover:text-accent"
      >
        {label}
      </button>
      {open && (
        <div className="mt-[9px] max-w-[500px] rounded-[7px] border border-line-200 bg-well px-[13px] py-[11px]">
          {comments.map((c) => (
            <div key={c.id} className="mb-[11px] flex gap-[9px]">
              <Avatar author={c.author} role={c.role} />
              <div>
                <div className="text-[11.5px] font-semibold text-ink-900">
                  {c.author}{" "}
                  <span className="text-[10.5px] font-normal text-ink-300">{c.time}</span>
                </div>
                <div className="text-[12.5px] leading-[1.5] font-normal text-ink-700">
                  {c.text}
                </div>
              </div>
            </div>
          ))}
          <div className="flex items-end gap-2">
            <textarea
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Add a comment…"
              className="flex-1 resize-none border-none bg-transparent text-[12.5px] leading-[1.5] text-ink-950 outline-none"
            />
            <Button variant="solid" size="post" className="flex-none" onClick={submit}>
              Post
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
