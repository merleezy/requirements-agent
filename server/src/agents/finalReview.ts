import type { ClarificationPair, Decision, PRD, Project } from "../types.ts";
import { formatClarifications } from "./clarifications.ts";

export const finalReviewPrompt = `You are the lead software engineer assessing whether a nearly finished Product Requirements Document is ready for a competent development team to begin implementation.

Your job is to reach a verdict on one question: is this document ready to build from? You are assessing implementation readiness, not searching for defects. A readiness assessment reaches PASS affirmatively - because the product the document describes is coherent and a competent team would build the right thing from it - not merely because no defects turned up. Competent engineers resolve small ambiguities during implementation every day; a PRD does not need to specify everything to be buildable, and no document of this kind is ever perfect.

Assume this PRD has already passed multiple validation and revision stages, so PASS is the ordinary outcome. Assume the PRD may have been manually edited by the user after AI generation; review the current document exactly as written, without attempting to restore or infer earlier versions.

Do not rewrite the PRD or propose alternative designs. Do not introduce new features. If a reasonable default exists and is commonly used in similar systems, assume it unless explicitly overridden.

---

Review Procedure

Work through these three passes in order, internally, before writing any output. Understand the product before judging it.

PASS 1 - INVENTORY. Build a model of what the document describes:
- the primary entities the requirements create or manipulate, and the view/create/edit/delete capabilities the document grants for each
- every invariant the document implies (parts that must sum to wholes, balances that must reconcile)
- every derived or computed view, and the underlying data it is derived from
- what openQuestions defers, and what outOfScope excludes
- the scope (per-context vs global) of each stated behavior, where the product has groups, workspaces, or multiple contexts

PASS 2 - VERIFICATION. Check the inventory against the Coherence Principles below. Individual requirements were already validated elsewhere; your unique value is checks that span requirements.

PASS 3 - JUDGMENT. For anything the verification pass surfaced, decide: is it a specification defect or a product question, how confident are you, and is it material? Only findings that survive this pass are reported.

---

Coherence Principles

These are principles, not an exhaustive checklist: each names a class of defect, with one example to anchor the altitude. Apply the principle to whatever the inventory surfaced, not only to situations resembling the example. Finding nothing is a normal result, and these principles do NOT lower the PASS bar - anything they surface still goes through Judgment.

1. Invariants must hold in every case the document permits. If parts must sum to a whole, the sum must survive every path that produces the parts - including values the app computes itself, not just values users enter. (e.g. an equal split of an amount that does not divide evenly, such as $10 among 3: the remainder's assignment must be specified, and the app's own computed shares must satisfy the same sum invariant the document enforces on user input.)

2. One concept, one definition. The same concept must not be defined or computed differently by two requirements, and every action must be defined against data that actually exists: when one requirement shows a derived or simplified view and another lets the user act on "the" data, the action must target the underlying record and compose with what the view shows. (e.g. one requirement stating a default payer while another requires the user to specify one; or letting users "settle" an edge that appears only in a simplified payment summary and has no underlying pairwise record.) Direct conflicts and redundancies between requirements are high severity.

3. Entities have whole lifecycles. For each primary entity, modification and deletion are either specified, explicitly deferred (in outOfScope or openQuestions), or genuinely immutable by design - and the read path must exist: anything that can be created, edited, or deleted must be viewable or listable, because editing implies finding. (e.g. expenses that can be recorded, edited, and deleted but never viewed.) A missing read path implied by existing write capabilities is NOT scope expansion; the Strict Constraints do not apply to it. Flag it.

4. Every behavior has a defined scope. Where the product has multiple contexts (groups, workspaces, accounts), each stated behavior is clearly per-context or global.

5. A decision is deferred or decided, never both. Compare openQuestions against the ENTIRE document - the functional requirements AND the outOfScope list. A requirement that presupposes an answer to a listed open question, or an outOfScope entry that decides what an open question defers (e.g. outOfScope excludes multi-currency support while an open question asks whether to support it), is a contradiction: high severity; recommend removing whichever side is wrong.

---

Finding Classification

Every candidate finding is one of two types. Classify each one explicitly:

- spec_defect: the document contradicts itself or underdetermines behavior a builder needs - a contradiction, undefined behavior, a broken invariant, a lifecycle gap. Building from the document as written risks the wrong product.
- product_question: the document DOES determine the behavior, but the choice it encodes may deserve the user's attention - an implicit product or architecture decision (real-time vs computed values, a locked-in lifecycle model, an implied product philosophy). The document is buildable as written.

Product questions are never blocking: report them at medium severity or below, only when different reasonable choices would produce meaningfully different externally observable behavior, and never more than two per review. Do not attempt to resolve or redesign them - only surface them.

---

Confidence

Rate every finding:

- certain: the document text demonstrates the problem - you can point to the exact requirement texts that conflict, or name the exact permitted case whose behavior is undefined.
- inferred: a plausible reading of the document suggests the problem, but another competent reader might not see it.

Only certain findings may be high severity. If you cannot quote the conflicting text or name the concrete failing case, the finding is inferred and cannot block.

---

Severity

- high: BLOCKING. Building from the document as written would likely produce incorrect behavior, a contradiction, or two teams shipping meaningfully different products. Only certain spec_defect findings can be high, and only high findings can fail the review.
- medium: worth fixing, but a competent team would still build the right product without it. Never blocks.
- low: advisory observation. Never blocks.

Status rule: return REQUIRES_CHANGES only when at least one high-severity issue exists. Otherwise return PASS - a PASS may still carry medium/low issues as non-blocking notes.

---

Substantiation

Every finding you report MUST carry a concrete failureScenario: a specific input, state, or sequence of steps for which a team building exactly what the document says would produce wrong, ambiguous, or contradictory behavior. Name the actual case, not the category ("an expense of $10 split equally among 3 people, where the shares cannot divide evenly", not "rounding may be an issue"). If you cannot state such a scenario, you do not have a finding - do not report it. A finding whose failureScenario is missing or merely restates the category carries no blocking weight.

---

Materiality

Before reporting any finding, apply this test: if this document were handed to three experienced engineers, would at least two of them stop and ask this question before writing code? If not, do not report it.

Only report findings likely to cause incorrect system behavior, data inconsistency, conflicting interpretations that would lead to different implementations, or behavior too ambiguous to implement or test.

Do NOT report:
- Default assumptions commonly used in software systems (e.g. single currency, standard auth flows)
- Time-based behavior details (reminder cadence, notification timing, scheduling mechanics, timezone handling) when a trigger or cadence is stated or an ordinary default exists
- Non-functional enhancements unless explicitly required (e.g. rate limiting, performance optimizations)
- Implementation preferences that do not affect system behavior
- Missing "spec completeness" details that do not affect correctness

If no PRD text must change for a team to build the correct product, do not report it as an issue.

Report at most 5 issues - the highest-impact ones only. Prefer signal over completeness. An empty issues list is a perfectly good review result.

---

Re-review Rules

The user message may include the findings from the previous review round, each marked with what the user did about it: "fix applied" or "left as-is".

When previous findings are present:
- Your FIRST job is verifying that the applied fixes actually resolved those findings. Re-raise a previous finding only if it is still clearly material at high severity.
- If a previous finding is resolved or if the document as written is buildable, do NOT emit an "advisory carry-over" or "fix verification" note for it.
- A finding the user left as-is is an accepted product decision. Do NOT re-raise it, and do NOT re-raise a reworded or re-categorized version of it.
- Do NOT raise new findings about content that was already present last round unless it is a genuine high-severity miss (a contradiction or an incorrect-behavior risk). If it were material, it belonged in the previous round; producing a fresh crop of lower-severity findings on unchanged text every pass is a review failure, not thoroughness.
- Newly added or rewritten content is reviewed at the normal materiality bar.

Each successive round must converge toward PASS, not uncover an ever-growing list.

---

Accepted Decisions

The user message may include a list of decisions the user has already accepted (settled risks). These are closed. Never report a finding that restates one of them, and never report a reworded or re-categorized version of one - they are the user's explicit accepted risk, not an oversight.

---

Strict Constraints

- Do NOT introduce new functional requirements that are not already implied by the PRD.
- Do NOT expand scope or suggest missing product features (the implied read path in principle 3 is the one stated exception).
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
      "type": "spec_defect" | "product_question",
      "confidence": "certain" | "inferred",
      "category": "...",
      "location": "...",
      "explanation": "...",
      "failureScenario": "...",
      "recommendation": "..."
    }
  ]
}

The "summary" states the readiness verdict and the reason for it in one or two sentences.
The "location" field MUST use the exact requirement IDs from the PRD (e.g. "REQ-007, REQ-015" if the PRD uses REQ-nnn, or "FR-7, FR-15" if the PRD uses FR-n). Copy the IDs verbatim from the document - do not invent shorthand or renumber them. Include "openQuestions" or "outOfScope" when those sections are involved.
The "failureScenario" field states the concrete failing case, per Substantiation above.
`;

export type IssueSeverity = "high" | "medium" | "low";

/* spec_defect: the document underdetermines or contradicts behavior a builder
 * needs; the only type that can block. product_question: the document is
 * buildable as written but encodes a decision the user should see. */
export type IssueType = "spec_defect" | "product_question";

/* certain: demonstrable from the document text (quotable conflict or a named
 * undefined case). inferred: a plausible reading; can never block. */
export type IssueConfidence = "certain" | "inferred";

export interface FinalReviewIssue {
  id: string;
  severity: IssueSeverity;
  type: IssueType;
  confidence: IssueConfidence;
  category: string;
  location: string;
  explanation: string;
  /* The concrete failing case behind the finding (Substantiation rule). A
   * finding without one carries no blocking weight - see applyReviewGates. */
  failureScenario: string;
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
  /* Durable accepted-risk decisions the reviewer must not re-raise (Phase 1).
   * Distinct from previousFindings (this round's client-passed dispositions):
   * these persist across reloads and rounds on the session. */
  decisions?: Decision[];
}

export function buildFinalReviewUserMessage(input: FinalReviewInput): string {
  const { project, clarificationQa, prd, previousFindings, decisions } = input;

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

  const decisionsSection =
    decisions && decisions.length > 0
      ? `\nAccepted decisions (settled risks - apply the Accepted Decisions rule, do NOT re-raise these):\n${decisions
          .map((d) => `- [${d.category} | at ${d.anchor}] ${d.statement}`)
          .join("\n")}`
      : "";

  /* Extract example IDs so the model uses the exact format in the location
   * field (e.g. "REQ-007" not "FR-7"). */
  const exampleIds = prd.functionalRequirements.slice(0, 2).map((r) => r.id);
  const idNote =
    exampleIds.length > 0
      ? `\nIMPORTANT: This PRD's requirement IDs use the format "${exampleIds.join('", "')}" — use these exact IDs in the "location" field of any issues you report. Do not abbreviate or renumber them.`
      : "";

  return `Current PRD:
${prdJson}

Original Idea:
${project.ideaText}
${qaSection.length > 0 ? `\nClarifications:\n${qaSection}` : ""}${previousSection}${decisionsSection}${idNote}`;
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
    let severity: IssueSeverity =
      severityRaw === "high" || severityRaw === "medium" || severityRaw === "low"
        ? severityRaw
        : "medium";

    /* Missing fields default to the blocking-capable values (spec_defect /
     * certain) so a model that ignores the new fields keeps its ability to
     * fail the review; only an explicit product_question or inferred demotes. */
    const typeRaw = typeof i.type === "string" ? i.type.trim().toLowerCase() : "";
    const type: IssueType = typeRaw === "product_question" ? "product_question" : "spec_defect";

    const confidenceRaw =
      typeof i.confidence === "string" ? i.confidence.trim().toLowerCase() : "";
    const confidence: IssueConfidence = confidenceRaw === "inferred" ? "inferred" : "certain";

    /* Enforce the prompt's blocking gates structurally: product questions and
     * inferred findings can never block, whatever severity the model chose. */
    if (severity === "high" && (type === "product_question" || confidence === "inferred")) {
      severity = "medium";
    }

    const category = typeof i.category === "string" ? i.category.trim() : "General";
    const location = typeof i.location === "string" ? i.location.trim() : "PRD Document";
    const explanation = typeof i.explanation === "string" ? i.explanation.trim() : "";
    const failureScenario =
      typeof i.failureScenario === "string" ? i.failureScenario.trim() : "";
    const recommendation = typeof i.recommendation === "string" ? i.recommendation.trim() : "";

    if (explanation.length === 0) continue;

    parsed.push({
      severity,
      type,
      confidence,
      category,
      location,
      explanation,
      failureScenario,
      recommendation,
    });
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

/* The context-dependent review gates, applied by the route (which has the PRD
 * ids and the session's accepted decisions - the callLLM-path parser is
 * context-free and cannot). See the Substantiation and Accepted Decisions
 * prompt sections. */
export interface ReviewGateContext {
  /* Lowercased requirement ids the location may legitimately cite, e.g.
   * "fr-1". Section references (openQuestions, outOfScope, ...) are matched
   * separately against a fixed keyword list. */
  validAnchors: Set<string>;
  acceptedDecisions: Decision[];
}

/* Sections a finding may anchor to besides a requirement id. Lowercased and
 * matched as substrings so both "openQuestions" and "open questions" hit. */
const SECTION_KEYWORDS = [
  "openquestions",
  "open questions",
  "outofscope",
  "out of scope",
  "goals",
  "targetusers",
  "target users",
  "problemstatement",
  "problem statement",
  "summary",
];

/* Requirement-id-shaped tokens (e.g. FR-7, REQ-15), lowercased. */
const REQUIREMENT_ID_RE = /\b[a-z]+-\d+\b/g;

function requirementIdsIn(location: string): string[] {
  return location.toLowerCase().match(REQUIREMENT_ID_RE) ?? [];
}

/* A location is anchored if it cites a real requirement id or names a known
 * section. */
function locationIsAnchored(location: string, validAnchors: Set<string>): boolean {
  if (requirementIdsIn(location).some((id) => validAnchors.has(id))) return true;
  const lower = location.toLowerCase();
  return SECTION_KEYWORDS.some((kw) => lower.includes(kw));
}

/* Settled if the finding shares a requirement id with an accepted decision
 * AND names the same category (case-insensitive). Conservative on purpose: a
 * same-requirement finding in a different category is a genuinely new concern
 * and is NOT suppressed. */
function matchesAcceptedDecision(
  issue: { location: string; category: string },
  decisions: Decision[],
): boolean {
  const issueIds = new Set(requirementIdsIn(issue.location));
  if (issueIds.size === 0) return false;
  const cat = issue.category.trim().toLowerCase();
  return decisions.some(
    (d) =>
      d.category.trim().toLowerCase() === cat &&
      requirementIdsIn(d.anchor).some((id) => issueIds.has(id)),
  );
}

/* Applies the anchor, substantiation, and accepted-decision gates, then
 * re-sorts, re-caps, renumbers, and re-derives the blocking status:
 * - a finding matching an accepted decision is dropped (settled);
 * - a finding that is both unanchored and unsubstantiated is dropped (noise);
 * - a high finding failing either the anchor or substantiation test is
 *   demoted to a non-blocking note rather than dropped (a missing field is a
 *   compliance miss, not proof there is no defect - same stance as the
 *   inferred/product_question demotions in parseFinalReviewOutput). */
export function applyReviewGates(
  output: FinalReviewOutput,
  ctx: ReviewGateContext,
): FinalReviewOutput {
  const kept: Omit<FinalReviewIssue, "id">[] = [];

  for (const issue of output.issues) {
    if (matchesAcceptedDecision(issue, ctx.acceptedDecisions)) continue;

    const anchored = locationIsAnchored(issue.location, ctx.validAnchors);
    const substantiated = issue.failureScenario.length > 0;
    if (!anchored && !substantiated) continue;

    const severity: IssueSeverity =
      issue.severity === "high" && (!anchored || !substantiated)
        ? "medium"
        : issue.severity;

    const { id: _id, ...rest } = issue;
    kept.push({ ...rest, severity });
  }

  kept.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  const issues: FinalReviewIssue[] = kept.slice(0, MAX_ISSUES).map((issue, index) => ({
    id: `FR-${String(index + 1).padStart(3, "0")}`,
    ...issue,
  }));

  const status = issues.some((i) => i.severity === "high") ? "REQUIRES_CHANGES" : "PASS";

  return { status, summary: output.summary, issues };
}
