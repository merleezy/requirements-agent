import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFinalReviewUserMessage,
  parseFinalReviewOutput,
} from "./finalReview.ts";
import type { PRD, Project } from "../types.ts";

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
