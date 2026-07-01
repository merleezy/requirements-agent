interface SectionHeadingProps {
  number: string; /* two-digit ordinal, e.g. "01" */
  title: string;
}

export function SectionHeading({ number, title }: SectionHeadingProps) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="font-mono text-[11px] font-semibold text-ink-200">{number}</span>
      <span className="font-display text-[15px] font-semibold tracking-[-0.01em] text-ink-900">
        {title}
      </span>
    </div>
  );
}
