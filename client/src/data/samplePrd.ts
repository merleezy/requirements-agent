import type { ChatMessage, Comment, PRD } from "../types";

/*
 * Hardcoded PRD for build-order step 2 (static document, no AI yet).
 * Content mirrors the receipt-capture example in the design reference,
 * including its copy, so the rendered result can be compared 1:1.
 */

export const samplePrd: PRD = {
  title: "Receipt Capture & Extraction",
  subtitle: "Auto-fill expense fields from a photographed or uploaded receipt.",
  version: "Draft v3",
  problemStatement: {
    id: "p1",
    text: "Employees expense dozens of receipts a month, keying in vendor, date, and amount by hand. Manual entry is slow, and finance rejects roughly 18% of submissions for missing or mismatched data. We want people to capture a receipt and have the key fields filled automatically, with a quick confirmation step.",
  },
  targetUsers: [
    { id: "u1", text: "Field employees submitting expenses from their phone, often between sites." },
    { id: "u2", text: "Finance reviewers who approve or reject reports against policy." },
    { id: "u3", text: "Team admins who configure categories, limits, and approval routing." },
  ],
  goals: [
    { id: "g1", text: "Cut the average time to file one expense from minutes to seconds." },
    { id: "g2", text: "Bring finance's rejection rate for bad data below 5%." },
  ],
  functionalRequirements: [
    {
      id: "r1",
      ref: "REQ-011",
      text: "Users can capture a receipt via camera or upload; vendor, date, and total are extracted into editable fields.",
      status: "draft",
      flag: null,
      highlight: null,
    },
    {
      id: "r2",
      ref: "REQ-013",
      text: "Receipt processing should feel fast and responsive.",
      status: "flagged",
      highlight: "fast and responsive",
      flag: {
        dimension: "testable",
        nature: "defect",
        reason:
          "Not testable — there is no pass/fail condition. “Fast” and “responsive” can’t be verified by QA.",
        suggestedRewrite:
          "95% of receipts finish extraction within 3 seconds (p95 ≤ 3s), measured from upload to fields populated.",
        assumption: null,
      },
    },
    {
      id: "r3",
      ref: "REQ-014",
      text: "When OCR field confidence is below 80%, the user is prompted to confirm the value before saving.",
      status: "draft",
      flag: null,
      highlight: null,
    },
    {
      id: "r4",
      ref: "REQ-018",
      text: "The scanner also detects and categorizes business-card contacts from the same photo.",
      status: "flagged",
      highlight: "business-card contacts",
      flag: {
        dimension: "scoped",
        nature: "judgment",
        reason:
          "Possible scope creep — contact scanning sits outside receipt capture. It isn’t broken, just a judgment call for this release.",
        suggestedRewrite: null,
        assumption: null,
      },
    },
  ],
  outOfScope: [
    { id: "s1", text: "Mileage and per-diem expenses — kept in the legacy tool for this release." },
    { id: "s2", text: "Multi-currency conversion at capture time." },
  ],
  openQuestions: [
    { id: "q1", text: "When a receipt has multiple line items, is that one expense or several?" },
    { id: "q2", text: "Do we need offline capture, or can we assume a connection at submit time?" },
  ],
};

export const seedComments: Record<string, Comment[]> = {
  p1: [
    {
      id: "c1",
      author: "Maya Chen",
      role: "user",
      text: "Can we cite the 18% figure? Finance will ask where it's from.",
      time: "1d",
    },
  ],
};

export const seedChat: ChatMessage[] = [
  {
    id: "m1",
    role: "agent",
    text: "I drafted this PRD from your notes on the receipt-capture idea. The critic flagged two requirements below - one needs a rewrite, one's a scope call. Anything you'd like me to revise?",
  },
];

export const chatChips = [
  "What am I missing?",
  "Add a security requirement",
  "Tighten the problem statement",
];
