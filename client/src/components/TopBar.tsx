import { Button } from "./Button";

interface TopBarProps {
  title: string;
  version: string;
  flagCount: number;
}

export function TopBar({ title, version, flagCount }: TopBarProps) {
  const flagSummary =
    flagCount === 0 ? "No open flags" : flagCount === 1 ? "1 flag open" : `${flagCount} flags open`;
  return (
    <div className="flex h-[54px] flex-none items-center justify-between border-b border-line-500 bg-paper px-6">
      <div className="flex min-w-0 items-center gap-3.5">
        <div className="font-display text-[13px] font-semibold tracking-[-0.01em] text-ink-950">
          {title}
        </div>
        <div className="font-mono text-[10px] font-medium tracking-[0.1em] text-ink-400 uppercase">
          PRD · {version}
        </div>
      </div>
      <div className="flex items-center gap-3.5">
        <div className="font-mono text-[10.5px] font-medium text-ink-500">{flagSummary}</div>
        <div className="h-5 w-px bg-line-300" />
        <Button variant="primary">Export</Button>
      </div>
    </div>
  );
}
