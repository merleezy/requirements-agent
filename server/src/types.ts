/*
 * Server-side data model, following the "Data model" and "Critic rubric"
 * sections of docs/requirements-agent-spec.md.
 *
 * client/src/types.ts mirrors these shapes plus UI-only fields (ref,
 * highlight, Comment/ChatMessage). The duplication is deliberate for now -
 * the API contract firms up at step 5 (draft agent wired end to end), and
 * that's the point to decide whether a shared types package earns its
 * workspace complexity.
 */

export type RubricDimension =
  | "unambiguous"
  | "atomic"
  | "testable"
  | "scoped"
  | "traceable";

export type FlagNature = "defect" | "judgment";

/* The critic's per-requirement, per-pass output (spec: "Critic output shape"). */
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
  text: string;
  section: "functionalRequirements";
  status: RequirementStatus;
  flag: CriticFlag | null;
}

export interface PRD {
  /* One-sentence subtitle from the draft agent (prompt revision 2026-07-01);
   * the document title lives on Project. */
  summary: string;
  problemStatement: string;
  targetUsers: string[];
  goals: string[];
  functionalRequirements: Requirement[];
  outOfScope: string[];
  openQuestions: string[];
}

/* Provisional stage tracking - refined as pipeline steps (5-7, 9) land. */
export type ProjectStage = "clarifying" | "drafting" | "reviewing" | "complete";

export interface Project {
  title: string;
  ideaText: string;
  createdAt: string; /* ISO timestamp */
  stage: ProjectStage;
}

export interface Annotation {
  id: string;
  targetId: string; /* requirement or section item id */
  userComment: string;
  agentResponse: string | null;
  resolved: boolean;
}

/* Pipeline history, kept so agent runs are visible/debuggable (spec: AgentRun).
 * input/output are the JSON passed to / returned by callLLM - never the API key. */
export interface AgentRun {
  stage: string;
  input: unknown;
  output: unknown;
  timestamp: string; /* ISO timestamp */
}
