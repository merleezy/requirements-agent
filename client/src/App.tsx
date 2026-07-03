import { useReducer, useState, useRef } from "react";
import { ChatPanel } from "./components/ChatPanel";
import { ClarifyView } from "./components/ClarifyView";
import { HomePage } from "./components/HomePage";
import { PRDDocument } from "./components/PRDDocument";
import { SettingsPage } from "./components/SettingsPage";
import { TopBar } from "./components/TopBar";
import { deriveChatChips } from "./state/chips";
import {
  continueClarify,
  startClarify,
  type ClarificationPair,
  type ClarifyQuestion,
} from "./state/clarify";
import {
  isRetryableFailure,
  runCritic,
  type CriticFailure,
  type RequirementCheck,
} from "./state/critic";
import { startDraft } from "./state/draft";
import {
  acceptSuggestedRewrite,
  confirmJudgment,
  moveRequirementToOutOfScope,
  submitRevisionFeedback,
  type ReviseLocalResult,
} from "./state/reviseLocal";
import { sendGlobalFeedback } from "./state/reviseGlobal";
import { runFinalReview, type PreviousFindingPayload } from "./state/finalReview";
import { useApiKey, useServerSession } from "./state/session";
import type { ChatMessage, Comment, PRD, PrdItem, Requirement } from "./types";
import {
  FinalReviewModal,
  type FinalReviewIssue,
  type FinalReviewResult,
} from "./components/FinalReviewModal";
import { ExportOptionsModal } from "./components/ExportOptionsModal";
import { downloadPrdAsMarkdown } from "./util/exportPrd";

/*
 * Steps 5-6: starting from the home page runs clarify round 1; if it asks
 * nothing the draft runs immediately, otherwise the ClarifyView collects
 * answers, an automatic round-2 check may add follow-ups (2 rounds max,
 * server-enforced), and then the draft agent writes the PRD the document
 * view renders. Document interactions (comments, flag actions, chat) still
 * mutate local state only; they sync to the server with the critic (step 7)
 * and annotation loop (step 9).
 */

/* The in-flight clarify round-trip (between home and document views). */
interface ClarifyFlow {
  ideaText: string;
  round: number; /* which round `questions` belongs to */
  questions: ClarifyQuestion[]; /* the current round's questions */
  priorPairs: ClarificationPair[]; /* round-1 Q&A, once round === 2 */
}

interface AppState {
  prd: PRD | null; /* null = no project yet (home view) */
  comments: Record<string, Comment[]>;
  chat: ChatMessage[];
}

type Action =
  | { type: "loadPrd"; prd: PRD }
  | { type: "applyCritique"; checks: (RequirementCheck & { checkedText: string })[] }
  | { type: "applyRevision"; requirements: Requirement[]; outOfScope: PrdItem[] }
  | { type: "applyGlobalRevision"; prd: PRD }
  | { type: "agentChat"; text: string }
  | { type: "addComment"; targetId: string; text: string }
  | { type: "addAgentComment"; targetId: string; text: string }
  | { type: "sendChat"; text: string }
  | { type: "optimisticAcceptRewrite"; id: string; text: string }
  | { type: "optimisticConfirmJudgment"; id: string }
  | { type: "optimisticMoveToOutOfScope"; id: string };

function reducer(state: AppState, action: Action): AppState {
  if (action.type === "loadPrd") {
    const count = action.prd.functionalRequirements.length;
    return {
      prd: action.prd,
      comments: {},
      chat: [
        {
          id: crypto.randomUUID(),
          role: "agent",
          text: `I drafted this PRD from your idea - ${count} functional ${count === 1 ? "requirement" : "requirements"} across the standard sections. Read it over and leave comments on anything that looks off.`,
        },
      ],
    };
  }
  if (action.type === "agentChat") {
    return {
      ...state,
      chat: [...state.chat, { id: crypto.randomUUID(), role: "agent", text: action.text }],
    };
  }
  if (!state.prd) return state;

  switch (action.type) {
    case "applyCritique": {
      const byId = new Map(action.checks.map((c) => [c.id, c]));
      return {
        ...state,
        prd: {
          ...state.prd,
          functionalRequirements: state.prd.functionalRequirements.map((r) => {
            const check = byId.get(r.id);
            if (check && check.checkedText === r.text) {
              return { ...r, status: check.status, flag: check.flag, highlight: null };
            }
            return r;
          }),
        },
      };
    }
    case "applyRevision":
      /* Wholesale replacement, not a per-id merge: every revise-local
       * outcome (including judgment confirmations and scope moves) is now
       * persisted server-side first, so the response is always the
       * authoritative full state - and a resolved atomic split changes
       * both the array's length and its ids, so there'd be nothing
       * meaningful to merge by id anyway. */
      return {
        ...state,
        prd: {
          ...state.prd,
          functionalRequirements: action.requirements,
          outOfScope: action.outOfScope,
        },
      };
    case "applyGlobalRevision":
      /* Wholesale replace: a global pass can touch any section, and the
       * server state is authoritative and cumulative, so applying the full
       * returned PRD converges even if a local revision was in flight.
       * Comments keyed by now-removed ids simply stop rendering. */
      return { ...state, prd: action.prd };
    case "addComment": {
      const comment: Comment = {
        id: crypto.randomUUID(),
        author: "You",
        role: "user",
        text: action.text,
        time: "now",
      };
      return {
        ...state,
        comments: {
          ...state.comments,
          [action.targetId]: [...(state.comments[action.targetId] ?? []), comment],
        },
      };
    }
    case "addAgentComment": {
      const comment: Comment = {
        id: crypto.randomUUID(),
        author: "Draftsmith",
        role: "agent",
        text: action.text,
        time: "now",
      };
      return {
        ...state,
        comments: {
          ...state.comments,
          [action.targetId]: [...(state.comments[action.targetId] ?? []), comment],
        },
      };
    }
    case "sendChat":
      return {
        ...state,
        chat: [...state.chat, { id: crypto.randomUUID(), role: "user", text: action.text }],
      };
    case "optimisticAcceptRewrite":
      return {
        ...state,
        prd: {
          ...state.prd,
          functionalRequirements: state.prd.functionalRequirements.map((r) =>
            r.id === action.id ? { ...r, text: action.text, status: "draft", flag: null, highlight: null } : r
          ),
        },
      };
    case "optimisticConfirmJudgment":
      return {
        ...state,
        prd: {
          ...state.prd,
          functionalRequirements: state.prd.functionalRequirements.map((r) =>
            r.id === action.id ? { ...r, status: "accepted", flag: null } : r
          ),
        },
      };
    case "optimisticMoveToOutOfScope": {
      const req = state.prd.functionalRequirements.find((r) => r.id === action.id);
      if (!req) return state;
      return {
        ...state,
        prd: {
          ...state.prd,
          functionalRequirements: state.prd.functionalRequirements.filter((r) => r.id !== action.id),
          outOfScope: [...state.prd.outOfScope, { id: req.id, text: req.text }],
        },
      };
    }
  }
}

/* Draftsmith's chat report once a critic pass finishes. */
function critiqueSummary(
  prd: PRD,
  checks: RequirementCheck[],
  failures: CriticFailure[],
): string {
  const refById = new Map(prd.functionalRequirements.map((r) => [r.id, r.ref]));
  const flagged = checks.filter((c) => c.flag !== null).length;
  const checkedCount = checks.length - failures.length;
  const opening =
    flagged === 0
      ? `The critic reviewed ${checkedCount === 1 ? "the requirement" : `all ${checkedCount} requirements`} - everything passed the rubric.`
      : `The critic reviewed ${checkedCount} requirements and flagged ${flagged} - each flag in the document shows the failing dimension and how to resolve it.`;
  if (failures.length === 0) return opening;
  const refs = failures.map((f) => refById.get(f.requirementId) ?? f.requirementId).join(", ");
  return `${opening} I couldn't check ${refs} (${failures[0].message}) - ${failures.length === 1 ? "it stays" : "they stay"} unmarked.`;
}

/* Short section label for a section-item id, used to prefix the chat mirror
 * of a comment (requirement targets use their REQ ref instead). */
const SECTION_LABELS: Record<string, string> = {
  ps: "Problem statement",
  tu: "Target users",
  g: "Goals",
  oos: "Out of scope",
  oq: "Open questions",
};

function sectionLabelFor(targetId: string): string {
  if (targetId === "ps") return SECTION_LABELS.ps;
  const prefix = targetId.split("-")[0];
  return SECTION_LABELS[prefix] ?? "Document";
}

/* The display name a comment's chat mirror is prefixed with: a requirement's
 * REQ ref when the target is a requirement, otherwise its section label. */
function targetDisplayName(prd: PRD, targetId: string): string {
  const req = prd.functionalRequirements.find((r) => r.id === targetId);
  return req ? req.ref : sectionLabelFor(targetId);
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, { prd: null, comments: {}, chat: [] });
  const [clarifyFlow, setClarifyFlow] = useState<ClarifyFlow | null>(null);
  /* Settings overlays whichever view is current (step 8); Back returns to it.
   * Plain state, consistent with the no-router decision. */
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState<"clarify" | "check" | "draft" | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const { error: backendError } = useServerSession();
  const [apiKey, setApiKey] = useApiKey();

  /* A ref to always access the latest state in asynchronous closures */
  const stateRef = useRef(state);
  stateRef.current = state;

  /* The local revise loop: any number of requirements can have a
   * revise-local call in flight at once (each row tracks its own), plus
   * the last "couldn't resolve this" message per requirement id (cleared
   * on that id's next successful revision). Every outcome is also logged
   * to the chat panel, so it doubles as a visible history of what's been
   * resolved and how - not just an unused feedback box. */
  const [revisingIds, setRevisingIds] = useState<ReadonlySet<string>>(new Set());
  const [unresolvedMessages, setUnresolvedMessages] = useState<Record<string, string>>({});

  /* The global revise loop runs one whole-document feedback call at a time
   * (chat send or a section/requirement comment). While it's in flight the
   * chat panel shows a pending bubble and blocks further sends; comment
   * posts are blocked in the handlers below with a chat notice. */
  const [chatBusy, setChatBusy] = useState(false);

  /* Final Review modal state & workflow */
  const [exportOptionsModalOpen, setExportOptionsModalOpen] = useState(false);
  const [finalReviewModalOpen, setFinalReviewModalOpen] = useState(false);
  const [finalReviewEvaluating, setFinalReviewEvaluating] = useState(false);
  const [finalReviewResult, setFinalReviewResult] = useState<FinalReviewResult | null>(null);
  const [appliedIssueIds, setAppliedIssueIds] = useState<Set<string>>(new Set());
  const [dismissedIssueIds, setDismissedIssueIds] = useState<Set<string>>(new Set());
  const [revisingIssueId, setRevisingIssueId] = useState<string | null>(null);
  const activeAbortControllerRef = useRef<AbortController | null>(null);

  const handleStopActiveProcess = () => {
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }
    setFinalReviewEvaluating(false);
    setRevisingIssueId(null);
    setChatBusy(false);
  };

  /* The previous round's findings, with what the user did about each, sent
   * back on re-runs so the reviewer verifies fixes and converges instead of
   * sampling fresh nitpicks every pass. */
  const buildPreviousFindings = (): PreviousFindingPayload[] | undefined => {
    if (!finalReviewResult || finalReviewResult.issues.length === 0) return undefined;
    return finalReviewResult.issues.map((i) => ({
      severity: i.severity,
      category: i.category,
      location: i.location,
      explanation: i.explanation,
      disposition: appliedIssueIds.has(i.id) ? "fix_applied" : "not_addressed",
    }));
  };

  const executeFinalReviewPass = async (previousFindings?: PreviousFindingPayload[]) => {
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    activeAbortControllerRef.current = controller;

    setFinalReviewEvaluating(true);
    try {
      const result = await runFinalReview(apiKey, previousFindings, controller.signal);
      setFinalReviewEvaluating(false);
      setFinalReviewResult(result);

      if (result.status === "PASS") {
        if (result.issues.length === 0) {
          dispatch({
            type: "agentChat",
            text: "Final review passed. No significant implementation issues were found.",
          });
          const currentPrd = stateRef.current.prd;
          if (currentPrd) {
            setTimeout(() => {
              downloadPrdAsMarkdown(currentPrd);
              setFinalReviewModalOpen(false);
            }, 1000);
          }
        } else {
          dispatch({
            type: "agentChat",
            text: `Final review passed - the PRD is buildable as written. ${result.issues.length} non-blocking note${result.issues.length === 1 ? "" : "s"} listed in the review dialog.`,
          });
        }
      } else {
        const blocking = result.issues.filter((i) => i.severity === "high").length;
        dispatch({
          type: "agentChat",
          text: `Final review found ${result.issues.length} finding${result.issues.length === 1 ? "" : "s"} (${blocking} blocking). Click Export to review them.`,
        });
      }
    } catch (err) {
      setFinalReviewEvaluating(false);
      if (err instanceof Error && err.name === "AbortError") {
        dispatch({ type: "agentChat", text: "Final review cancelled by user." });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      dispatch({ type: "agentChat", text: `Final review failed (${message}).` });
    } finally {
      if (activeAbortControllerRef.current === controller) {
        activeAbortControllerRef.current = null;
      }
    }
  };

  /* True while a final review or a finding fix is in flight. The modal can
   * be hidden during either (browsing continues, the request keeps running);
   * the Export button then reopens the review instead of the options modal. */
  const finalReviewActive = finalReviewEvaluating || revisingIssueId !== null;

  const handleExportClick = () => {
    if (!state.prd) return;
    if (finalReviewActive) {
      setFinalReviewModalOpen(true);
      return;
    }
    setExportOptionsModalOpen(true);
  };

  const handleViewSavedReview = () => {
    setExportOptionsModalOpen(false);
    setFinalReviewModalOpen(true);
  };

  const handleConfirmRunReview = () => {
    const previousFindings = buildPreviousFindings();
    setExportOptionsModalOpen(false);
    setAppliedIssueIds(new Set());
    setDismissedIssueIds(new Set());
    setRevisingIssueId(null);
    setFinalReviewResult(null);
    setFinalReviewEvaluating(true);
    setFinalReviewModalOpen(true);
    void executeFinalReviewPass(previousFindings);
  };

  const handleReRunReview = () => {
    const previousFindings = buildPreviousFindings();
    setAppliedIssueIds(new Set());
    setDismissedIssueIds(new Set());
    setRevisingIssueId(null);
    setFinalReviewResult(null);
    setFinalReviewEvaluating(true);
    void executeFinalReviewPass(previousFindings);
  };

  const handleExportImmediately = () => {
    setExportOptionsModalOpen(false);
    if (state.prd) {
      downloadPrdAsMarkdown(state.prd);
    }
  };

  const handleDismissIssue = (issueId: string) => {
    setDismissedIssueIds((s) => new Set(s).add(issueId));
  };

  const handleRespondToIssue = async (issue: FinalReviewIssue, userThoughts: string) => {
    if (!state.prd) return;

    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    activeAbortControllerRef.current = controller;

    setRevisingIssueId(issue.id);
    const instruction =
      `Treat the current PRD as the canonical document. The user provided explicit design rationale regarding final review finding ${issue.id} ("${issue.explanation}"): "${userThoughts}". ` +
      `Update the PRD document or open questions accordingly to incorporate this decision.`;

    dispatch({ type: "sendChat", text: `Respond to ${issue.id}: "${userThoughts}"` });
    dispatch({ type: "agentChat", text: `Updating PRD based on response to ${issue.id}…` });

    setChatBusy(true);
    try {
      const { prd, summary, recheckIds } = await sendGlobalFeedback(
        instruction,
        undefined,
        apiKey,
        controller.signal,
      );
      dispatch({ type: "applyGlobalRevision", prd });
      dispatch({ type: "agentChat", text: summary });
      setAppliedIssueIds((s) => new Set(s).add(issue.id));

      if (recheckIds.length > 0) {
        const textMap = new Map(
          prd.functionalRequirements
            .filter((r) => recheckIds.includes(r.id))
            .map((r) => [r.id, r.text]),
        );
        void runBackgroundCritic(recheckIds, textMap);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        dispatch({ type: "agentChat", text: `Response to ${issue.id} cancelled.` });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      dispatch({ type: "agentChat", text: `Couldn't apply response for ${issue.id} (${message}).` });
    } finally {
      if (activeAbortControllerRef.current === controller) {
        activeAbortControllerRef.current = null;
      }
      setChatBusy(false);
      setRevisingIssueId(null);
    }
  };

  const handleApplySingleAiFix = async (issue: FinalReviewIssue) => {
    if (!state.prd) return;

    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    activeAbortControllerRef.current = controller;

    setRevisingIssueId(issue.id);
    const instruction =
      `Treat the current PRD as the canonical document. Preserve all existing content unless this review finding explicitly requires modifying it:\n` +
      `- [${issue.id} - ${issue.severity}] ${issue.explanation} Recommendation: ${issue.recommendation}`;

    dispatch({ type: "sendChat", text: `Apply AI fix for ${issue.id}` });
    dispatch({ type: "agentChat", text: `Revising PRD for ${issue.id}…` });

    setChatBusy(true);
    try {
      const { prd, summary, recheckIds } = await sendGlobalFeedback(
        instruction,
        undefined,
        apiKey,
        controller.signal,
      );
      dispatch({ type: "applyGlobalRevision", prd });
      dispatch({ type: "agentChat", text: summary });
      setAppliedIssueIds((s) => new Set(s).add(issue.id));

      if (recheckIds.length > 0) {
        const textMap = new Map(
          prd.functionalRequirements
            .filter((r) => recheckIds.includes(r.id))
            .map((r) => [r.id, r.text]),
        );
        void runBackgroundCritic(recheckIds, textMap);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        dispatch({ type: "agentChat", text: `AI revision for ${issue.id} cancelled.` });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      dispatch({ type: "agentChat", text: `Couldn't apply AI fix for ${issue.id} (${message}).` });
    } finally {
      if (activeAbortControllerRef.current === controller) {
        activeAbortControllerRef.current = null;
      }
      setChatBusy(false);
      setRevisingIssueId(null);
    }
  };

  const handleApplyAllAiFixes = async () => {
    if (!finalReviewResult || !state.prd) return;
    const unapplied = finalReviewResult.issues.filter(
      (i) => !appliedIssueIds.has(i.id) && !dismissedIssueIds.has(i.id),
    );
    if (unapplied.length === 0) return;

    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    activeAbortControllerRef.current = controller;

    setRevisingIssueId("ALL");
    const issuesFormatted = unapplied
      .map((i) => `- [${i.id} - ${i.severity}] ${i.explanation} Recommendation: ${i.recommendation}`)
      .join("\n");

    const instruction =
      `Treat the current PRD as the canonical document. Preserve all existing content unless a review finding explicitly requires modifying it. ` +
      `Apply ONLY modifications directly related to the final review findings:\n${issuesFormatted}`;

    dispatch({ type: "sendChat", text: "Apply AI fixes for all remaining Final Review findings" });
    dispatch({ type: "agentChat", text: "Revising PRD for all remaining findings…" });

    setChatBusy(true);
    try {
      const { prd, summary, recheckIds } = await sendGlobalFeedback(
        instruction,
        undefined,
        apiKey,
        controller.signal,
      );
      dispatch({ type: "applyGlobalRevision", prd });
      dispatch({ type: "agentChat", text: summary });
      setAppliedIssueIds((s) => {
        const next = new Set(s);
        unapplied.forEach((i) => next.add(i.id));
        return next;
      });

      if (recheckIds.length > 0) {
        const textMap = new Map(
          prd.functionalRequirements
            .filter((r) => recheckIds.includes(r.id))
            .map((r) => [r.id, r.text]),
        );
        void runBackgroundCritic(recheckIds, textMap);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        dispatch({ type: "agentChat", text: "AI revision cancelled." });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      dispatch({ type: "agentChat", text: `Couldn't apply AI fixes (${message}).` });
    } finally {
      if (activeAbortControllerRef.current === controller) {
        activeAbortControllerRef.current = null;
      }
      setChatBusy(false);
      setRevisingIssueId(null);
    }
  };

  const handleExportAnyway = () => {
    if (state.prd) {
      downloadPrdAsMarkdown(state.prd);
    }
    setFinalReviewModalOpen(false);
  };

  async function runRevision(
    id: string,
    call: () => Promise<ReviseLocalResult>,
    criticIds: string[]
  ) {
    const currentPrd = stateRef.current.prd;
    const ref = currentPrd?.functionalRequirements.find((r) => r.id === id)?.ref ?? id;
    setRevisingIds((s) => new Set(s).add(id));
    try {
      const { requirements, outOfScope, message } = await call();
      dispatch({ type: "applyRevision", requirements, outOfScope });
      setUnresolvedMessages((m) => {
        const next = { ...m };
        if (message) next[id] = message;
        else delete next[id];
        return next;
      });

      if (message) {
        dispatch({ type: "agentChat", text: `${ref}: that didn't resolve it - ${message}` });
      }

      if (criticIds.length > 0) {
        const newReqs = requirements.filter((r) => r.id === id || r.id.startsWith(`${id}.`));
        const newIds = newReqs.map((r) => r.id);
        const textMap = new Map(newReqs.map((r) => [r.id, r.text]));
        void runBackgroundCritic(newIds, textMap);
      }
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      dispatch({ type: "agentChat", text: `${ref}: I couldn't revise that (${text}).` });
    } finally {
      setRevisingIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }

  async function runBackgroundCritic(ids: string[], textMap: Map<string, string>) {
    setReviewing(true);
    setRevisingIds((s) => {
      const next = new Set(s);
      ids.forEach((id) => next.add(id));
      return next;
    });

    try {
      const { requirements, failures } = await runCritic(ids, apiKey);
      const checks = requirements.map((c) => ({
        ...c,
        checkedText: textMap.get(c.id) ?? "",
      }));

      dispatch({ type: "applyCritique", checks });

      // Log results to the chat log
      checks.forEach((c) => {
        if (c.checkedText !== "") {
          const currentPrd = stateRef.current.prd;
          const ref = currentPrd?.functionalRequirements.find((r) => r.id === c.id)?.ref ?? c.id;
          if (c.flag) {
            const { dimension, reason, suggestedRewrite } = c.flag;
            let text = `I flagged **${ref}** (${dimension}): ${reason}`;
            if (suggestedRewrite) {
              const lines = suggestedRewrite.split("\n").map((l) => l.trim()).filter(Boolean);
              if (lines.length > 1) {
                text += `\nSuggested split:\n` + lines.map((line) => `- ${line}`).join("\n");
              } else {
                text += `\nSuggested rewrite: "${suggestedRewrite}"`;
              }
            }
            dispatch({ type: "agentChat", text });
          } else {
            dispatch({ type: "agentChat", text: `**${ref}** now passes the rubric.` });
          }
        }
      });

      failures.forEach((f) => {
        const currentPrd = stateRef.current.prd;
        const ref = currentPrd?.functionalRequirements.find((r) => r.id === f.requirementId)?.ref ?? f.requirementId;
        dispatch({ type: "agentChat", text: `I couldn't check **${ref}** (${f.message}).` });
      });

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      dispatch({ type: "agentChat", text: `Background check failed: ${msg}` });
    } finally {
      setReviewing(false);
      setRevisingIds((s) => {
        const next = new Set(s);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }
  }

  /* The global revise loop, shared by the chat box and by section/
   * requirement comments. The user-role chat mirror is dispatched by the
   * caller (it differs: raw text for chat, a target-prefixed line for a
   * comment); this runs the call, applies the authoritative PRD, reports
   * the summary, optionally echoes it into the originating comment thread,
   * and re-checks changed/new requirements with the background critic. */
  async function runGlobalFeedback(
    feedback: string,
    targetId: string | undefined,
    commentTargetId?: string,
  ) {
    setChatBusy(true);
    try {
      const { prd, summary, recheckIds } = await sendGlobalFeedback(feedback, targetId, apiKey);
      dispatch({ type: "applyGlobalRevision", prd });
      dispatch({ type: "agentChat", text: summary });
      if (commentTargetId) {
        dispatch({ type: "addAgentComment", targetId: commentTargetId, text: summary });
      }
      if (recheckIds.length > 0) {
        const textMap = new Map(
          prd.functionalRequirements
            .filter((r) => recheckIds.includes(r.id))
            .map((r) => [r.id, r.text]),
        );
        void runBackgroundCritic(recheckIds, textMap);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      dispatch({ type: "agentChat", text: `I couldn't apply that feedback (${message}).` });
    } finally {
      setChatBusy(false);
    }
  }

  const handleSendChat = (text: string) => {
    dispatch({ type: "sendChat", text });
    void runGlobalFeedback(text, undefined);
  };

  const handleAddComment = (targetId: string, feedback: string) => {
    const currentPrd = stateRef.current.prd;
    /* A global pass is already running; keep the comment local and tell the
     * user why nothing came back, rather than queueing a second call. */
    if (chatBusy) {
      dispatch({ type: "addComment", targetId, text: feedback });
      dispatch({
        type: "agentChat",
        text: "I'm still applying the last change - post that comment again once I'm done.",
      });
      return;
    }
    dispatch({ type: "addComment", targetId, text: feedback });
    const name = currentPrd ? targetDisplayName(currentPrd, targetId) : targetId;
    dispatch({ type: "sendChat", text: `[${name}] ${feedback}` });
    void runGlobalFeedback(feedback, targetId, targetId);
  };

  const handleAcceptRewrite = (id: string) => {
    const currentPrd = stateRef.current.prd;
    const req = currentPrd?.functionalRequirements.find((r) => r.id === id);
    if (!req || !req.flag || !req.flag.suggestedRewrite) return;
    const rewriteText = req.flag.suggestedRewrite;
    const ref = req.ref;

    dispatch({ type: "optimisticAcceptRewrite", id, text: rewriteText });
    dispatch({ type: "sendChat", text: `Accept rewrite for ${ref}` });
    dispatch({ type: "agentChat", text: `Applied suggested rewrite for **${ref}**.` });

    void runRevision(id, () => acceptSuggestedRewrite(id, apiKey), [id]);
  };

  const handleSubmitFeedback = (id: string, feedback: string) => {
    const currentPrd = stateRef.current.prd;
    const req = currentPrd?.functionalRequirements.find((r) => r.id === id);
    if (!req) return;
    const ref = req.ref;

    dispatch({ type: "sendChat", text: `[${ref}] ${feedback}` });
    dispatch({ type: "agentChat", text: `Revising **${ref}** based on your feedback…` });

    void runRevision(id, () => submitRevisionFeedback(id, feedback, apiKey), [id]);
  };

  const handleConfirmJudgment = (id: string) => {
    const currentPrd = stateRef.current.prd;
    const req = currentPrd?.functionalRequirements.find((r) => r.id === id);
    if (!req) return;
    const ref = req.ref;

    dispatch({ type: "optimisticConfirmJudgment", id });
    dispatch({ type: "sendChat", text: `Confirm ${ref} as-is` });
    dispatch({ type: "agentChat", text: `Marked **${ref}** as accepted.` });

    void runRevision(id, () => confirmJudgment(id, apiKey), []);
  };

  const handleMoveToOutOfScope = (id: string) => {
    const currentPrd = stateRef.current.prd;
    const req = currentPrd?.functionalRequirements.find((r) => r.id === id);
    if (!req) return;
    const ref = req.ref;

    dispatch({ type: "optimisticMoveToOutOfScope", id });
    dispatch({ type: "sendChat", text: `Move ${ref} to Out of Scope` });
    dispatch({ type: "agentChat", text: `Moved **${ref}** to Out of Scope.` });

    void runRevision(id, () => moveRequirementToOutOfScope(id, apiKey), []);
  };

  const handleApplySuggestion = (id: string) => {
    const currentPrd = stateRef.current.prd;
    const req = currentPrd?.functionalRequirements.find((r) => r.id === id);
    if (!req || !req.flag) return;
    const ref = req.ref;
    const reason = req.flag.reason ?? "";
    const dimension = req.flag.dimension;

    const actionText =
      dimension === "scoped"
        ? `Ground ${ref} in PRD`
        : dimension === "traceable"
          ? `Update goals for ${ref}`
          : `Update PRD for ${ref}`;

    dispatch({ type: "optimisticConfirmJudgment", id });
    dispatch({ type: "sendChat", text: actionText });
    dispatch({ type: "agentChat", text: `Updating PRD context/goals for **${ref}**…` });

    const instruction = `Requirement ${ref} ("${req.text}") was flagged (${dimension}): "${reason}". Update the PRD context or goals accordingly to ground this requirement.`;
    void runGlobalFeedback(instruction, id);
  };

  async function runDraft(ideaText: string, pairs: ClarificationPair[]) {
    setBusy("draft");
    const prd = await startDraft(ideaText, pairs, apiKey);
    dispatch({ type: "loadPrd", prd });
    setClarifyFlow(null);
    /* Deliberately not awaited: the document is usable while the critic
     * reviews it; the pass owns its own status and error reporting. */
    void runCriticPass(prd);
  }

  /* The automatic critic pass after a draft. Per-requirement failures get
   * one retry (unless the key itself is the problem); whatever still fails
   * is reported in chat and left unmarked rather than blocking the flow. */
  async function runCriticPass(prd: PRD) {
    setReviewing(true);
    try {
      let { requirements, failures } = await runCritic(undefined, apiKey);
      const retryIds = failures.filter(isRetryableFailure).map((f) => f.requirementId);
      if (retryIds.length > 0) {
        const retry = await runCritic(retryIds, apiKey);
        /* The server state is cumulative, so the retry response already
         * includes the first pass's successful checks. */
        requirements = retry.requirements;
        failures = [...failures.filter((f) => !isRetryableFailure(f)), ...retry.failures];
      }

      const textMap = new Map(prd.functionalRequirements.map((r) => [r.id, r.text]));
      const checks = requirements.map((c) => ({
        ...c,
        checkedText: textMap.get(c.id) ?? "",
      }));

      dispatch({ type: "applyCritique", checks });
      dispatch({ type: "agentChat", text: critiqueSummary(prd, requirements, failures) });

      // Log critic suggestions individually to the chat log
      checks.forEach((c) => {
        if (c.flag) {
          const ref = prd.functionalRequirements.find((r) => r.id === c.id)?.ref ?? c.id;
          const { dimension, reason, suggestedRewrite } = c.flag;
          let text = `I flagged **${ref}** (${dimension}): ${reason}`;
          if (suggestedRewrite) {
            const lines = suggestedRewrite.split("\n").map((l) => l.trim()).filter(Boolean);
            if (lines.length > 1) {
              text += `\nSuggested split:\n` + lines.map((line) => `- ${line}`).join("\n");
            } else {
              text += `\nSuggested rewrite: "${suggestedRewrite}"`;
            }
          }
          dispatch({ type: "agentChat", text });
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      dispatch({
        type: "agentChat",
        text: `I couldn't run the requirement check (${message}). The draft is still fully usable - its requirements just aren't marked yet.`,
      });
    } finally {
      setReviewing(false);
    }
  }

  async function handleStart(ideaText: string) {
    setPipelineError(null);
    setBusy("clarify");
    try {
      const questions = await startClarify(ideaText, apiKey);
      if (questions.length === 0) {
        await runDraft(ideaText, []);
      } else {
        setClarifyFlow({ ideaText, round: 1, questions, priorPairs: [] });
      }
    } catch (err) {
      setPipelineError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleAnswers(pairs: ClarificationPair[]) {
    if (!clarifyFlow) return;
    setPipelineError(null);
    try {
      if (clarifyFlow.round === 1) {
        /* Round 2 runs automatically on the round-1 answers; it usually
         * returns nothing and the draft starts right away. */
        setBusy("check");
        const followUps = await continueClarify(pairs, apiKey);
        if (followUps.length > 0) {
          setClarifyFlow({ ...clarifyFlow, round: 2, questions: followUps, priorPairs: pairs });
        } else {
          await runDraft(clarifyFlow.ideaText, pairs);
        }
      } else {
        await runDraft(clarifyFlow.ideaText, [...clarifyFlow.priorPairs, ...pairs]);
      }
    } catch (err) {
      setPipelineError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const flagCount = state.prd
    ? state.prd.functionalRequirements.filter((r) => r.flag).length
    : 0;

  return (
    /* Desktop-first per the design reference; below 1080px the page scrolls horizontally */
    <div className="flex h-screen min-w-[1080px] flex-col bg-canvas">
      {settingsOpen ? (
        <SettingsPage onBack={() => setSettingsOpen(false)} />
      ) : state.prd === null ? (
        clarifyFlow === null ? (
          <HomePage
            apiKey={apiKey}
            onApiKeyChange={setApiKey}
            backendError={backendError}
            busy={busy === "check" ? null : busy /* "check" never occurs on home */}
            error={pipelineError}
            onStart={handleStart}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        ) : (
          <ClarifyView
            key={clarifyFlow.round /* reset the answer inputs per round */}
            round={clarifyFlow.round}
            questions={clarifyFlow.questions}
            busy={busy === "clarify" ? null : busy /* "clarify" never occurs here */}
            error={pipelineError}
            onSubmit={handleAnswers}
          />
        )
      ) : (
        <>
          <TopBar
            title={state.prd.title}
            version={state.prd.version}
            flagCount={flagCount}
            reviewing={reviewing}
            onOpenSettings={() => setSettingsOpen(true)}
            onExport={handleExportClick}
            finalReviewActive={finalReviewActive}
          />
          <div className="flex min-h-0 flex-1">
            <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto px-[34px] pt-[34px] pb-[90px]">
              <PRDDocument
                prd={state.prd}
                comments={state.comments}
                onAddComment={handleAddComment}
                onAcceptRewrite={handleAcceptRewrite}
                onSubmitFeedback={handleSubmitFeedback}
                onConfirmJudgment={handleConfirmJudgment}
                onMoveToOutOfScope={handleMoveToOutOfScope}
                onApplySuggestion={handleApplySuggestion}
                revisingIds={revisingIds}
                unresolvedMessages={unresolvedMessages}
                reviewing={reviewing}
              />
            </div>
            <ChatPanel
              messages={state.chat}
              chips={deriveChatChips(state.prd)}
              busy={chatBusy}
              onSend={handleSendChat}
            />
          </div>

          {exportOptionsModalOpen && (
            <ExportOptionsModal
              hasSavedReview={finalReviewResult !== null}
              onViewSavedReview={handleViewSavedReview}
              onRunReviewAndExport={handleConfirmRunReview}
              onExportImmediately={handleExportImmediately}
              onClose={() => setExportOptionsModalOpen(false)}
            />
          )}

          {finalReviewModalOpen && (
            <FinalReviewModal
              evaluating={finalReviewEvaluating}
              result={finalReviewResult}
              appliedIssueIds={appliedIssueIds}
              dismissedIssueIds={dismissedIssueIds}
              revisingIssueId={revisingIssueId}
              onApplyAllAiFixes={handleApplyAllAiFixes}
              onApplySingleAiFix={handleApplySingleAiFix}
              onDismissIssue={handleDismissIssue}
              onRespondToIssue={handleRespondToIssue}
              onReRunReview={handleReRunReview}
              onStopActiveProcess={handleStopActiveProcess}
              onExportAnyway={handleExportAnyway}
              onCancel={() => setFinalReviewModalOpen(false)}
            />
          )}
        </>
      )}
    </div>
  );
}
