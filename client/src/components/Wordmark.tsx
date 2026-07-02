/*
 * The Draftsmith wordmark shown above the centered pre-document cards
 * (home page, clarify view), echoing the chat panel's agent header.
 */

export function Wordmark() {
  return (
    <div className="mb-5 flex items-center gap-[9px]">
      <div className="flex h-[26px] w-[26px] items-center justify-center rounded-md bg-accent font-mono text-[10px] font-semibold text-white">
        AI
      </div>
      <div className="font-display text-[13px] font-semibold text-ink-950">Draftsmith</div>
      <div className="font-mono text-[10.5px] text-ink-400">requirements agent</div>
    </div>
  );
}
