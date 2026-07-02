/*
 * Client-side data model, aligned with the "Data model" and "Critic rubric"
 * sections of docs/requirements-agent-spec.md so later steps can wire the
 * backend in without reshaping the UI state.
 */

export type RubricDimension =
  | "unambiguous"
  | "atomic"
  | "testable"
  | "scoped"
  | "traceable";

export type FlagNature = "defect" | "judgment";

export interface CriticFlag {
  dimension: RubricDimension;
  nature: FlagNature;
  reason: string;
  suggestedRewrite: string | null; /* null for judgment dimensions */
  assumption: string | null; /* only set when a rewrite resolves ambiguity */
}

export type RequirementStatus = "draft" | "flagged" | "accepted";

export interface Requirement {
  id: string;
  ref: string; /* display reference, e.g. "REQ-013" */
  text: string;
  status: RequirementStatus;
  flag: CriticFlag | null;
  /* Substring of text the flag refers to; rendered with a dotted underline. */
  highlight: string | null;
  acceptedAsIs?: boolean;
}

/* A commentable non-requirement item (persona, goal, scope note, question). */
export interface PrdItem {
  id: string;
  text: string;
}

export interface PRD {
  title: string;
  subtitle: string;
  version: string; /* e.g. "Draft v3" */
  problemStatement: PrdItem;
  targetUsers: PrdItem[];
  goals: PrdItem[];
  functionalRequirements: Requirement[];
  outOfScope: PrdItem[];
  openQuestions: PrdItem[];
}

export interface Comment {
  id: string;
  author: string; /* "You", "Draftsmith", or a person's name */
  role: "user" | "agent";
  text: string;
  time: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  text: string;
}
