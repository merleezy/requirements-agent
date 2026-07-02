import { useReducer, useState, useRef } from "react";
import { ChatPanel } from "./components/ChatPanel";
import { ClarifyView } from "./components/ClarifyView";
import { HomePage } from "./components/HomePage";
import { PRDDocument } from "./components/PRDDocument";
import { TopBar } from "./components/TopBar";
import { chatChips } from "./data/samplePrd";
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
import { useApiKey, useServerSession } from "./state/session";
import type { ChatMessage, Comment, PRD, PrdItem, Requirement } from "./types";

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
  | { type: "agentChat"; text: string }
  | { type: "addComment"; targetId: string; text: string }
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

export default function App() {
  const [state, dispatch] = useReducer(reducer, { prd: null, comments: {}, chat: [] });
  const [clarifyFlow, setClarifyFlow] = useState<ClarifyFlow | null>(null);
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
      setRevisingIds((s) => {
        const next = new Set(s);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }
  }

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
      {state.prd === null ? (
        clarifyFlow === null ? (
          <HomePage
            apiKey={apiKey}
            onApiKeyChange={setApiKey}
            backendError={backendError}
            busy={busy === "check" ? null : busy /* "check" never occurs on home */}
            error={pipelineError}
            onStart={handleStart}
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
          />
          <div className="flex min-h-0 flex-1">
            <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto px-[34px] pt-[34px] pb-[90px]">
              <PRDDocument
                prd={state.prd}
                comments={state.comments}
                onAddComment={(targetId, text) => dispatch({ type: "addComment", targetId, text })}
                onAcceptRewrite={handleAcceptRewrite}
                onSubmitFeedback={handleSubmitFeedback}
                onConfirmJudgment={handleConfirmJudgment}
                onMoveToOutOfScope={handleMoveToOutOfScope}
                revisingIds={revisingIds}
                unresolvedMessages={unresolvedMessages}
                reviewing={reviewing}
              />
            </div>
            <ChatPanel
              messages={state.chat}
              chips={chatChips}
              onSend={(text) => dispatch({ type: "sendChat", text })}
            />
          </div>
        </>
      )}
    </div>
  );
}
