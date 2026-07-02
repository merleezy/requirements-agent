/*
 * Splits the critic/revise-local agents' one-requirement-per-line encoding
 * for atomic splits (spec: "put each resulting requirement on its own line
 * in suggestedRewrite/revisedText, plain lines, no numbering or bullets").
 * A single-behavior rewrite is just the degenerate one-line case.
 */
export function splitRequirementLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
