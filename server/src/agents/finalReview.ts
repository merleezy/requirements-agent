import type { ClarificationPair, PRD, Project } from "../types.ts";
import { formatClarifications } from "./clarifications.ts";

export const finalReviewPrompt = `You are acting as a lead software engineer giving a nearly finished Product Requirements Document a final go/no-go review before development begins.

Your job is to answer one question: can a competent development team build the right product from this document? You are a pragmatic reviewer, not a formal verifier. Competent engineers resolve small ambiguities during implementation every day; a PRD does not need to specify everything to be buildable, and no document of this kind is ever perfect.

Assume this PRD has already passed multiple validation and revision stages, so a PASS is the ordinary outcome, not a rare one. Do not hunt for problems to justify the review. Assume the PRD may have been manually edited by the user after AI generation. Review the current document exactly as written without attempting to restore or infer earlier versions.

Do not rewrite the PRD or propose alternative designs. Do not introduce new features. Your role is to evaluate risks in the existing specification, not redesign the product.

If a reasonable default exists and is commonly used in similar systems, assume it unless explicitly overridden.

---

Severity Definitions

- high: BLOCKING. Building from the document as written would likely produce incorrect behavior, a contradiction, or two teams shipping meaningfully different products. These are the only issues that can fail the review.
- medium: worth fixing, but a competent team would still build the right product without it. Never blocks.
- low: advisory observation. Never blocks.

Status rule: return REQUIRES_CHANGES only when at least one high-severity issue exists. Otherwise return PASS - a PASS may still carry medium/low issues as non-blocking notes.

---

Materiality Rule

Only report issues that are likely to cause one of the following:
- Incorrect system behavior
- Data inconsistency or loss of correctness
- Conflicting interpretations that would lead to different implementations
- Missing or ambiguous behavior that would make implementation or testing unclear

Do NOT report:
- Default assumptions commonly used in software systems (e.g. single currency, standard auth flows)
- Time-based behavior details (reminder cadence, notification timing, scheduling mechanics, timezone handling) when a trigger or cadence is stated or an ordinary default exists
- Non-functional enhancements unless explicitly required (e.g. rate limiting, performance optimizations)
- Implementation preferences that do not affect system behavior
- Missing "spec completeness" details that do not affect correctness

Report at most 5 issues - the highest-impact ones only. Prefer signal over completeness. An empty issues list is a perfectly good review result.

---

Focus on:
- Missing functional requirements that are implied by existing behavior
- Missing edge cases that affect correctness
- Undefined behavior or lifecycle rules
- Ambiguous requirements that could lead to multiple implementations
- Conflicting requirements
- Inconsistent terminology
- Unrealistic or underspecified behavior assumptions that affect system logic
- Missing constraints ONLY when their absence would cause incorrect implementation

---

Hidden Assumption Detection

In addition to defects, identify cases where the PRD implicitly locks in a product or architecture decision without explicitly acknowledging it.

Examples include:
- Choosing between real-time vs computed values
- Assuming a specific lifecycle model (e.g. creation-time calculation vs recomputation)
- Implied product philosophy (tracking vs automation vs optimization)
- Any requirement that encodes a design decision that would significantly constrain future implementation choices

Only flag these when multiple reasonable interpretations would lead to meaningfully different system behavior, and report them at medium severity or below unless the divergent readings would produce incorrect behavior rather than merely different internal designs.

Do not attempt to resolve or redesign these assumptions. Only surface them as risks.

---

Re-review Rules

The user message may include the findings from the previous review round, each marked with what the user did about it: "fix applied" or "left as-is".

When previous findings are present:
- Your FIRST job is verifying that the applied fixes actually resolved those findings. Re-raise a previous finding only if it is still clearly material at high severity.
- A finding the user left as-is is an accepted risk. Do NOT re-raise it, and do NOT re-raise a reworded or re-categorized version of it.
- Do NOT raise new findings about content that was already present last round unless it is a genuine high-severity miss (a contradiction or an incorrect-behavior risk). If it were material, it belonged in the previous round; producing a fresh crop of lower-severity findings on unchanged text every pass is a review failure, not thoroughness.
- Newly added or rewritten content is reviewed at the normal materiality bar.

Each successive round must converge toward PASS, not uncover an ever-growing list.

---

Strict Constraints

- Do NOT introduce new functional requirements that are not already implied by the PRD.
- Do NOT expand scope or suggest missing product features.
- Do NOT flag implementation details that do not affect external system behavior.
- Do NOT treat missing information as a defect unless it directly impacts correctness or behavior.

---

Output ONLY this JSON shape, with no other text and no markdown code fences:
{
  "status": "PASS" | "REQUIRES_CHANGES",
  "summary": "...",
  "issues": [
    {
      "severity": "high" | "medium" | "low",
      "category": "...",
      "location": "...",
      "explanation": "...",
      "recommendation": "..."
    }
  ]
}
`;

export type IssueSeverity = "high" | "medium" | "low";

export interface FinalReviewIssue {
  id: string;
  severity: IssueSeverity;
  category: string;
  location: string;
  explanation: string;
  recommendation: string;
}

export interface FinalReviewOutput {
  status: "PASS" | "REQUIRES_CHANGES";
  summary: string;
  issues: FinalReviewIssue[];
}

/* A finding from the previous review round, sent back by the client on
 * re-runs so the reviewer converges instead of re-sampling fresh nitpicks.
 * disposition: "fix_applied" = an AI fix was run for it; "not_addressed" =
 * the user left it as-is (possibly after manual edits). */
export type PreviousFindingDisposition = "fix_applied" | "not_addressed";

export interface PreviousFinding {
  severity: IssueSeverity;
  category: string;
  location: string;
  explanation: string;
  disposition: PreviousFindingDisposition;
}

export interface FinalReviewInput {
  project: Project;
  clarificationQa: ClarificationPair[];
  prd: PRD;
  previousFindings?: PreviousFinding[];
}

export function buildFinalReviewUserMessage(input: FinalReviewInput): string {
  const { project, clarificationQa, prd, previousFindings } = input;

  const prdJson = JSON.stringify(
    {
      title: project.title,
      summary: prd.summary,
      problemStatement: prd.problemStatement,
      targetUsers: prd.targetUsers,
      goals: prd.goals,
      functionalRequirements: prd.functionalRequirements.map((r) => ({
        id: r.id,
        text: r.text,
      })),
      outOfScope: prd.outOfScope,
      openQuestions: prd.openQuestions,
    },
    null,
    2,
  );

  const qaSection = formatClarifications(clarificationQa);

  const previousSection =
    previousFindings && previousFindings.length > 0
      ? `\nFindings from the previous review round (apply the Re-review Rules):\n${previousFindings
          .map(
            (f) =>
              `- [${f.severity} | ${f.category} | at ${f.location}] ${f.explanation} (${
                f.disposition === "fix_applied" ? "fix applied" : "left as-is"
              })`,
          )
          .join("\n")}`
      : "";

  return `Current PRD:
${prdJson}

Original Idea:
${project.ideaText}
${qaSection.length > 0 ? `\nClarifications:\n${qaSection}` : ""}${previousSection}`;
}

/* The prompt caps issues at 5; tolerate an overshooting model by keeping the
 * 8 most severe instead of failing the call (same degrade-don't-error stance
 * as parseClarifyOutput). */
const MAX_ISSUES = 8;

const SEVERITY_RANK: Record<IssueSeverity, number> = { high: 0, medium: 1, low: 2 };

/* Normalizes the reply and derives the status from the issues rather than
 * trusting the model's own status field: only a high-severity issue can
 * produce REQUIRES_CHANGES, so medium/low observations ride along as
 * non-blocking notes on a PASS. The status field is still shape-checked as
 * a sanity signal that the model followed the contract at all. */
export function parseFinalReviewOutput(raw: unknown): FinalReviewOutput {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("final-review output is not an object");
  }

  const o = raw as Record<string, unknown>;

  const statusRaw = typeof o.status === "string" ? o.status.trim().toUpperCase() : "";
  if (statusRaw !== "PASS" && statusRaw !== "REQUIRES_CHANGES") {
    throw new Error("final-review output: status must be 'PASS' or 'REQUIRES_CHANGES'");
  }

  const summary = typeof o.summary === "string" ? o.summary.trim() : "";

  const issuesRaw = Array.isArray(o.issues) ? o.issues : [];
  const parsed: Omit<FinalReviewIssue, "id">[] = [];

  for (const item of issuesRaw) {
    if (typeof item !== "object" || item === null) continue;
    const i = item as Record<string, unknown>;

    const severityRaw = typeof i.severity === "string" ? i.severity.trim().toLowerCase() : "";
    const severity: IssueSeverity =
      severityRaw === "high" || severityRaw === "medium" || severityRaw === "low"
        ? severityRaw
        : "medium";

    const category = typeof i.category === "string" ? i.category.trim() : "General";
    const location = typeof i.location === "string" ? i.location.trim() : "PRD Document";
    const explanation = typeof i.explanation === "string" ? i.explanation.trim() : "";
    const recommendation = typeof i.recommendation === "string" ? i.recommendation.trim() : "";

    if (explanation.length === 0) continue;

    parsed.push({ severity, category, location, explanation, recommendation });
  }

  parsed.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  const issues: FinalReviewIssue[] = parsed.slice(0, MAX_ISSUES).map((issue, index) => ({
    id: `FR-${String(index + 1).padStart(3, "0")}`,
    ...issue,
  }));

  const status = issues.some((i) => i.severity === "high") ? "REQUIRES_CHANGES" : "PASS";

  return {
    status,
    summary,
    issues,
  };
}
