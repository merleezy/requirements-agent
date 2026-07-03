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

/*
 * Models occasionally cite other requirements by id inside requirement text
 * ("(per FR-12)", "as per REQ-3"). Those citations are broken by design:
 * ids are server-owned and shift meaning across splits/removals, and the UI
 * renders a separate positional display sequence (REQ-00n), so a stored id
 * reference either dangles or points the reader at the wrong requirement.
 * The prompts forbid them; this strips the ones that slip through anyway.
 *
 * Deliberately conservative: only citation-shaped forms are removed - a
 * parenthetical "(per FR-2)" / "(see REQ-3)" or an inline "per FR-2" /
 * "see FR-2" clause. A bare id in unusual prose is left alone rather than
 * risking mangled text.
 */
const ID_CITATION =
  /\s*\(\s*(?:per|see|cf\.?|as\s+(?:defined|described|specified)\s+in)?\s*(?:FR|REQ)-\d+(?:\.\d+)?\s*\)|\s*,?\s+(?:as\s+)?per\s+(?:FR|REQ)-\d+(?:\.\d+)?|\s+\(?see\s+(?:FR|REQ)-\d+(?:\.\d+)?\)?/gi;

export function stripRequirementIdReferences(text: string): string {
  return text
    .replace(ID_CITATION, "")
    .replace(/[^\S\n]{2,}/g, " ")
    .replace(/[^\S\n]+([.,;:])/g, "$1")
    .trim();
}
