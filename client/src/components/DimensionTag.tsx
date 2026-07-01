/*
 * Uppercase mono label naming the rubric dimension a critic flag failed on,
 * colored by the flag's nature (defect vs judgment) per the reference.
 */
interface DimensionTagProps {
  nature: "defect" | "judgment";
  children: string; /* dimension name, e.g. "Testable" */
}

export function DimensionTag({ nature, children }: DimensionTagProps) {
  const color = nature === "defect" ? "text-defect" : "text-judgment";
  return (
    <span
      className={`font-mono text-[10px] font-semibold uppercase tracking-[0.08em] ${color}`}
    >
      {children}
    </span>
  );
}
