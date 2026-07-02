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

/* One clarifying question and the user's answer, keyed by question TEXT, not
 * id - the server owns question identity, so answers travel with the text
 * they answer (decision 2026-07-01, see CLAUDE.md). An empty answer means
 * the user skipped the question. */
export interface ClarificationPair {
  question: string;
  answer: string;
}

/* A question the clarify agent asked, with its server-assigned id. */
export interface ClarifyQuestion {
  id: string; /* "CQ-1"... - assigned by the server, models mint no ids */
  question: string;
  whyItMatters: string;
  round: number; /* 1 or 2; the clarify stage is capped at 2 rounds */
}

/* Session-side record of the clarify round-trip. Answers are NOT stored
 * here - the client is their source of truth and sends them with each
 * request that needs them (clarify round 2, draft). */
export interface ClarifyState {
  ideaText: string;
  roundsUsed: number;
  questions: ClarifyQuestion[]; /* all rounds, in ask order */
}

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
  acceptedAsIs?: boolean;
}

export interface PRD {
  /* Document version, introduced by the revise loop at step 9: the draft
   * starts at 1, each applied global revision bumps it by one. */
  version: number;
  /* Monotonic counter for server-assigned requirement ids (FR-n). It only
   * ever increases, so an id removed by a revision is never reissued to a
   * new requirement - annotations and agent runs that referenced the old id
   * would otherwise silently point at an unrelated requirement. */
  nextRequirementNumber: number;
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
