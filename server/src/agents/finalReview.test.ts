import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyReviewGates,
  buildFinalReviewUserMessage,
  parseFinalReviewOutput,
  type FinalReviewIssue,
  type FinalReviewOutput,
} from "./finalReview.ts";
import type { Decision, PRD, Project } from "../types.ts";

const sampleProject: Project = {
  title: "Receipt Scanner App",
  ideaText: "An app that scans paper receipts and exports expense reports.",
  createdAt: new Date().toISOString(),
  stage: "reviewing",
};

const samplePrd: PRD = {
  version: 1,
  nextRequirementNumber: 3,
  summary: "Scans receipts and exports CSV reports.",
  problemStatement: "Users waste hours typing receipt data into spreadsheets.",
  targetUsers: ["Small business owners"],
  goals: ["Automate expense report generation"],
  functionalRequirements: [
    {
      id: "FR-1",
      section: "functionalRequirements",
      text: "The system shall scan paper receipts using OCR.",
      status: "accepted",
      flag: null,
    },
    {
      id: "FR-2",
      section: "functionalRequirements",
      text: "The system shall export summary reports to CSV format.",
      status: "accepted",
      flag: null,
    },
  ],
  outOfScope: ["Direct bank account integration"],
  openQuestions: ["Which accounting formats to support?"],
};

test("buildFinalReviewUserMessage includes PRD JSON and original idea", () => {
  const msg = buildFinalReviewUserMessage({
    project: sampleProject,
    clarificationQa: [{ question: "Format?", answer: "CSV" }],
    prd: samplePrd,
  });

  assert.ok(msg.includes("Receipt Scanner App"));
  assert.ok(msg.includes("An app that scans paper receipts"));
  assert.ok(msg.includes("The system shall scan paper receipts using OCR."));
  assert.ok(msg.includes("Format?"));
  assert.ok(!msg.includes("previous review round"));
});

test("buildFinalReviewUserMessage lists previous findings with dispositions", () => {
  const msg = buildFinalReviewUserMessage({
    project: sampleProject,
    clarificationQa: [],
    prd: samplePrd,
    previousFindings: [
      {
        severity: "high",
        category: "Conflict",
        location: "FR-1",
        explanation: "OCR and manual entry contradict each other.",
        disposition: "fix_applied",
      },
      {
        severity: "medium",
        category: "Undefined Behavior",
        location: "FR-2",
        explanation: "CSV delimiter is not specified.",
        disposition: "not_addressed",
      },
    ],
  });

  assert.ok(msg.includes("previous review round"));
  assert.ok(msg.includes("OCR and manual entry contradict each other. (fix applied)"));
  assert.ok(msg.includes("CSV delimiter is not specified. (left as-is)"));
});

test("parseFinalReviewOutput handles PASS status", () => {
  const parsed = parseFinalReviewOutput({
    status: "PASS",
    summary: "Document looks complete.",
    issues: [],
  });

  assert.equal(parsed.status, "PASS");
  assert.equal(parsed.summary, "Document looks complete.");
  assert.deepEqual(parsed.issues, []);
});

test("parseFinalReviewOutput assigns sequential IDs (FR-001, FR-002)", () => {
  const parsed = parseFinalReviewOutput({
    status: "REQUIRES_CHANGES",
    summary: "Found two implementation risks.",
    issues: [
      {
        severity: "high",
        category: "Missing Edge Case",
        location: "FR-1",
        explanation: "Unclear handling when image resolution is too low for OCR.",
        recommendation: "Add error prompt when OCR fails.",
      },
      {
        severity: "medium",
        category: "Undefined Behavior",
        location: "FR-2",
        explanation: "CSV delimiter character is not specified.",
        recommendation: "Specify standard comma delimiter with UTF-8 encoding.",
      },
    ],
  });

  assert.equal(parsed.status, "REQUIRES_CHANGES");
  assert.equal(parsed.issues.length, 2);
  assert.equal(parsed.issues[0].id, "FR-001");
  assert.equal(parsed.issues[0].severity, "high");
  assert.equal(parsed.issues[1].id, "FR-002");
  assert.equal(parsed.issues[1].severity, "medium");
});

test("parseFinalReviewOutput rejects invalid status", () => {
  assert.throws(
    () => parseFinalReviewOutput({ status: "UNKNOWN" }),
    /status must be 'PASS' or 'REQUIRES_CHANGES'/,
  );
});

const issue = (severity: string, explanation: string) => ({
  severity,
  category: "General",
  location: "FR-1",
  explanation,
  recommendation: "",
});

test("only a high-severity issue blocks: medium/low become a PASS with notes", () => {
  const parsed = parseFinalReviewOutput({
    status: "REQUIRES_CHANGES",
    summary: "Minor observations only.",
    issues: [issue("medium", "Delimiter unspecified."), issue("low", "Terminology drift.")],
  });

  assert.equal(parsed.status, "PASS");
  assert.equal(parsed.issues.length, 2);
});

test("a high-severity issue forces REQUIRES_CHANGES even if the model said PASS", () => {
  const parsed = parseFinalReviewOutput({
    status: "PASS",
    summary: "Looks fine.",
    issues: [issue("high", "FR-1 and FR-2 contradict each other.")],
  });

  assert.equal(parsed.status, "REQUIRES_CHANGES");
  assert.equal(parsed.issues.length, 1);
});

test("missing type/confidence default to the blocking-capable values", () => {
  const parsed = parseFinalReviewOutput({
    status: "REQUIRES_CHANGES",
    summary: "Old-shape model output.",
    issues: [issue("high", "FR-1 and FR-2 contradict each other.")],
  });

  assert.equal(parsed.status, "REQUIRES_CHANGES");
  assert.equal(parsed.issues[0].type, "spec_defect");
  assert.equal(parsed.issues[0].confidence, "certain");
});

test("a high-severity product_question is demoted to medium and cannot block", () => {
  const parsed = parseFinalReviewOutput({
    status: "REQUIRES_CHANGES",
    summary: "Implicit design decision.",
    issues: [
      {
        ...issue("high", "The PRD locks in creation-time balance calculation."),
        type: "product_question",
        confidence: "certain",
      },
    ],
  });

  assert.equal(parsed.status, "PASS");
  assert.equal(parsed.issues[0].severity, "medium");
  assert.equal(parsed.issues[0].type, "product_question");
});

test("a high-severity inferred finding is demoted to medium and cannot block", () => {
  const parsed = parseFinalReviewOutput({
    status: "REQUIRES_CHANGES",
    summary: "Speculative reading.",
    issues: [
      {
        ...issue("high", "A reader might interpret balances as real-time."),
        type: "spec_defect",
        confidence: "inferred",
      },
    ],
  });

  assert.equal(parsed.status, "PASS");
  assert.equal(parsed.issues[0].severity, "medium");
  assert.equal(parsed.issues[0].confidence, "inferred");
});

test("a certain spec_defect at high severity still blocks", () => {
  const parsed = parseFinalReviewOutput({
    status: "PASS",
    summary: "Model under-called it.",
    issues: [
      {
        ...issue("high", "FR-1 requires OCR-only entry while FR-2 requires manual entry."),
        type: "spec_defect",
        confidence: "certain",
      },
    ],
  });

  assert.equal(parsed.status, "REQUIRES_CHANGES");
  assert.equal(parsed.issues[0].severity, "high");
});

test("issues are ordered by severity and truncated to 8", () => {
  const parsed = parseFinalReviewOutput({
    status: "REQUIRES_CHANGES",
    summary: "Overshooting model.",
    issues: [
      ...Array.from({ length: 6 }, (_, n) => issue("low", `Low note ${n}.`)),
      ...Array.from({ length: 3 }, (_, n) => issue("medium", `Medium note ${n}.`)),
      issue("high", "The one real problem."),
    ],
  });

  assert.equal(parsed.issues.length, 8);
  assert.equal(parsed.issues[0].severity, "high");
  assert.equal(parsed.issues[0].id, "FR-001");
  assert.equal(parsed.issues[0].explanation, "The one real problem.");
  assert.deepEqual(
    parsed.issues.map((i) => i.severity),
    ["high", "medium", "medium", "medium", "low", "low", "low", "low"],
  );
});

test("parseFinalReviewOutput passes failureScenario through, defaulting to empty", () => {
  const parsed = parseFinalReviewOutput({
    status: "REQUIRES_CHANGES",
    summary: "One with, one without.",
    issues: [
      {
        ...issue("high", "FR-1 and FR-2 contradict."),
        failureScenario: "Two teams read FR-1 as OCR-only and FR-2 as manual-only.",
      },
      issue("medium", "No scenario given."),
    ],
  });

  assert.equal(
    parsed.issues[0].failureScenario,
    "Two teams read FR-1 as OCR-only and FR-2 as manual-only.",
  );
  assert.equal(parsed.issues[1].failureScenario, "");
});

test("buildFinalReviewUserMessage lists accepted decisions the reviewer must not re-raise", () => {
  const msg = buildFinalReviewUserMessage({
    project: sampleProject,
    clarificationQa: [],
    prd: samplePrd,
    decisions: [
      {
        id: "D-1",
        kind: "accepted_risk",
        anchor: "FR-1",
        statement: "Falling back to manual entry when OCR fails is acceptable.",
        category: "Lifecycle",
        decidedAt: new Date().toISOString(),
      },
    ],
  });

  assert.ok(msg.includes("Accepted decisions"));
  assert.ok(msg.includes("Falling back to manual entry when OCR fails is acceptable."));
});

/* applyReviewGates: the anchor + substantiation + accepted-decision gates the
 * route applies after the (context-free) parser. */
const gateIssue = (o: Partial<FinalReviewIssue> = {}): FinalReviewIssue => ({
  id: "FR-001",
  severity: "high",
  type: "spec_defect",
  confidence: "certain",
  category: "General",
  location: "FR-1",
  explanation: "FR-1 and FR-2 contradict.",
  failureScenario: "A concrete failing case.",
  recommendation: "",
  ...o,
});

const gateOutput = (issues: FinalReviewIssue[]): FinalReviewOutput => ({
  status: "REQUIRES_CHANGES",
  summary: "",
  issues,
});

const validFr = () => new Set(["fr-1", "fr-2"]);

test("applyReviewGates demotes an unsubstantiated high to a non-blocking note", () => {
  const out = applyReviewGates(gateOutput([gateIssue({ failureScenario: "" })]), {
    validAnchors: validFr(),
    acceptedDecisions: [],
  });

  assert.equal(out.issues.length, 1);
  assert.equal(out.issues[0].severity, "medium");
  assert.equal(out.status, "PASS");
});

test("applyReviewGates demotes a high whose location matches no requirement id", () => {
  const out = applyReviewGates(gateOutput([gateIssue({ location: "FR-99" })]), {
    validAnchors: validFr(),
    acceptedDecisions: [],
  });

  assert.equal(out.issues[0].severity, "medium");
  assert.equal(out.status, "PASS");
});

test("applyReviewGates keeps a high anchored to a section by keyword", () => {
  const out = applyReviewGates(
    gateOutput([gateIssue({ location: "openQuestions vs outOfScope" })]),
    { validAnchors: validFr(), acceptedDecisions: [] },
  );

  assert.equal(out.issues[0].severity, "high");
  assert.equal(out.status, "REQUIRES_CHANGES");
});

test("applyReviewGates drops a finding that is both unanchored and unsubstantiated", () => {
  const out = applyReviewGates(
    gateOutput([gateIssue({ location: "somewhere vague", failureScenario: "" })]),
    { validAnchors: validFr(), acceptedDecisions: [] },
  );

  assert.equal(out.issues.length, 0);
  assert.equal(out.status, "PASS");
});

test("applyReviewGates keeps a substantiated, anchored high as blocking", () => {
  const out = applyReviewGates(gateOutput([gateIssue()]), {
    validAnchors: validFr(),
    acceptedDecisions: [],
  });

  assert.equal(out.issues[0].severity, "high");
  assert.equal(out.status, "REQUIRES_CHANGES");
});

test("applyReviewGates suppresses a finding matching an accepted decision (same anchor + category)", () => {
  const decision: Decision = {
    id: "D-1",
    kind: "accepted_risk",
    anchor: "FR-1",
    statement: "accepted",
    category: "Lifecycle",
    decidedAt: new Date().toISOString(),
  };
  const out = applyReviewGates(gateOutput([gateIssue({ category: "Lifecycle" })]), {
    validAnchors: validFr(),
    acceptedDecisions: [decision],
  });

  assert.equal(out.issues.length, 0);
});

test("applyReviewGates does NOT suppress a same-anchor finding in a different category", () => {
  const decision: Decision = {
    id: "D-1",
    kind: "accepted_risk",
    anchor: "FR-1",
    statement: "accepted",
    category: "Lifecycle",
    decidedAt: new Date().toISOString(),
  };
  const out = applyReviewGates(gateOutput([gateIssue({ category: "Invariant" })]), {
    validAnchors: validFr(),
    acceptedDecisions: [decision],
  });

  assert.equal(out.issues.length, 1);
});

test("applyReviewGates renumbers and re-sorts the survivors", () => {
  const out = applyReviewGates(
    gateOutput([
      gateIssue({ id: "FR-001", severity: "low", explanation: "low note", location: "FR-1" }),
      gateIssue({ id: "FR-002", location: "vague", failureScenario: "" }),
      gateIssue({ id: "FR-003", severity: "high", explanation: "real", location: "FR-2" }),
    ]),
    { validAnchors: validFr(), acceptedDecisions: [] },
  );

  assert.equal(out.issues.length, 2);
  assert.equal(out.issues[0].id, "FR-001");
  assert.equal(out.issues[0].severity, "high");
  assert.equal(out.issues[1].id, "FR-002");
  assert.equal(out.issues[1].severity, "low");
  assert.equal(out.status, "REQUIRES_CHANGES");
});
