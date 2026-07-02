import type { ClarificationPair, PRD, Project } from "../types.ts";
import { formatClarifications } from "./clarifications.ts";

export const finalReviewPrompt = `You are acting as a lead software engineer reviewing a nearly finished Product Requirements Document before development begins.

Your job is to evaluate implementation risk, contradictions, and ambiguous behavior that could lead to incorrect or inconsistent system design.

Assume this PRD has already passed multiple validation and revision stages.
Assume the PRD may have been manually edited by the user after AI generation. Review the current document exactly as written without attempting to restore or infer earlier versions.

Do not rewrite the PRD or propose alternative designs. Do not introduce new features. Your role is to evaluate risks in the existing specification, not redesign the product.

If a reasonable default exists and is commonly used in similar systems, assume it unless explicitly overridden.

Prefer fewer, high-impact findings over comprehensive completeness. It is acceptable to return only a small number of issues if they are the only meaningful risks.

---

Materiality Rule

Only flag issues that are likely to cause one of the following:
- Incorrect system behavior
- Data inconsistency or loss of correctness
- Conflicting interpretations that would lead to different implementations
- Missing or ambiguous behavior that would make implementation or testing unclear

Do NOT flag:
- Default assumptions commonly used in software systems (e.g. single currency, static notifications, standard auth flows)
- Non-functional enhancements unless explicitly required (e.g. rate limiting, performance optimizations)
- Implementation preferences that do not affect system behavior
- Missing “spec completeness” details that do not affect correctness

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

Only flag these when multiple reasonable interpretations would lead to meaningfully different system behavior.

Do not attempt to resolve or redesign these assumptions. Only surface them as risks.

---

Strict Constraints

- Do NOT introduce new functional requirements that are not already implied by the PRD.
- Do NOT expand scope or suggest missing product features.
- Do NOT flag implementation details that do not affect external system behavior.
- Do NOT treat missing information as a defect unless it directly impacts correctness or behavior.

---

Output Behavior

If the document is sufficiently complete and contains no material risks, return PASS.

Otherwise return REQUIRES_CHANGES with only the highest-impact issues.

Prefer signal over completeness.

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

export interface FinalReviewIssue {
  id: string;
  severity: "high" | "medium" | "low";
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

export interface FinalReviewInput {
  project: Project;
  clarificationQa: ClarificationPair[];
  prd: PRD;
}

export function buildFinalReviewUserMessage(input: FinalReviewInput): string {
  const { project, clarificationQa, prd } = input;

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

  return `Current PRD:
${prdJson}

Original Idea:
${project.ideaText}
${qaSection.length > 0 ? `\nClarifications:\n${qaSection}` : ""}`;
}

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
  const issues: FinalReviewIssue[] = [];

  if (statusRaw === "REQUIRES_CHANGES") {
    let count = 1;
    for (const item of issuesRaw) {
      if (typeof item !== "object" || item === null) continue;
      const i = item as Record<string, unknown>;

      const severityRaw = typeof i.severity === "string" ? i.severity.trim().toLowerCase() : "";
      const severity: "high" | "medium" | "low" =
        severityRaw === "high" || severityRaw === "medium" || severityRaw === "low"
          ? severityRaw
          : "medium";

      const category = typeof i.category === "string" ? i.category.trim() : "General";
      const location = typeof i.location === "string" ? i.location.trim() : "PRD Document";
      const explanation = typeof i.explanation === "string" ? i.explanation.trim() : "";
      const recommendation = typeof i.recommendation === "string" ? i.recommendation.trim() : "";

      if (explanation.length === 0) continue;

      const numStr = String(count).padStart(3, "0");
      issues.push({
        id: `FR-${numStr}`,
        severity,
        category,
        location,
        explanation,
        recommendation,
      });
      count++;
    }
  }

  const status = issues.length > 0 ? "REQUIRES_CHANGES" : "PASS";

  return {
    status,
    summary,
    issues,
  };
}
