import type { ClarificationPair, PRD, Project } from "../types.ts";
import { formatClarifications } from "./clarifications.ts";

export const finalReviewPrompt = `You are acting as the lead software engineer reviewing a nearly finished Product Requirements Document before development begins.

Assume this PRD has already passed multiple validation and revision stages.
Assume the PRD may have been manually edited by the user after AI generation. Review the current document exactly as written without attempting to restore or infer earlier versions.
Do not rewrite the PRD or propose alternative designs. Your role is to identify implementation risks, not redesign the product.

Do not search for trivial improvements. Only identify issues that would materially improve implementation quality or significantly reduce ambiguity.
Ignore formatting and stylistic preferences unless they could realistically cause engineering confusion.

Focus on:
- Missing functional requirements
- Missing edge cases
- Undefined behavior
- Ambiguous requirements
- Conflicting requirements
- Inconsistent terminology
- Missing acceptance criteria
- Unrealistic implementation assumptions
- Missing technical constraints
- Areas likely to generate developer questions

If the document is sufficiently complete, return PASS instead of inventing issues.

Output ONLY this JSON shape, with no other text and no markdown code fences:
{
  "status": "PASS" | "REQUIRES_CHANGES",
  "summary": "...",
  "issues": [
    {
      "severity": "high | medium | low",
      "category": "...",
      "location": "...",
      "explanation": "...",
      "recommendation": "..."
    }
  ]
}`;

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
