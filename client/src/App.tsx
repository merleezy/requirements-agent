import { useReducer, useState } from "react";
import { ChatPanel } from "./components/ChatPanel";
import { HomePage } from "./components/HomePage";
import { PRDDocument } from "./components/PRDDocument";
import { TopBar } from "./components/TopBar";
import { chatChips } from "./data/samplePrd";
import { startDraft } from "./state/draft";
import { useApiKey, useServerSession } from "./state/session";
import type { ChatMessage, Comment, PRD } from "./types";

/*
 * Step 5: the home page hands the idea to the real draft agent
 * (POST /api/draft through callLLM) and the document view renders the
 * returned PRD - the sample PRD is no longer shown. Document interactions
 * (comments, flag actions, chat) still mutate local state only; they sync
 * to the server with the critic (step 7) and annotation loop (step 9).
 */

interface AppState {
  prd: PRD | null; /* null = no project yet (home view) */
  comments: Record<string, Comment[]>;
  chat: ChatMessage[];
}

type Action =
  | { type: "loadPrd"; prd: PRD }
  | { type: "acceptRewrite"; id: string }
  | { type: "dismissFlag"; id: string } /* Decline / Accept as-is */
  | { type: "moveToOutOfScope"; id: string }
  | { type: "addComment"; targetId: string; text: string }
  | { type: "sendChat"; text: string };

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
  if (!state.prd) return state;

  switch (action.type) {
    case "acceptRewrite":
      return {
        ...state,
        prd: {
          ...state.prd,
          functionalRequirements: state.prd.functionalRequirements.map((r) =>
            r.id === action.id && r.flag?.suggestedRewrite
              ? {
                  ...r,
                  text: r.flag.suggestedRewrite,
                  highlight: null,
                  flag: null,
                  status: "accepted",
                }
              : r,
          ),
        },
      };
    case "dismissFlag":
      return {
        ...state,
        prd: {
          ...state.prd,
          functionalRequirements: state.prd.functionalRequirements.map((r) =>
            r.id === action.id
              ? { ...r, highlight: null, flag: null, status: "accepted" }
              : r,
          ),
        },
      };
    case "moveToOutOfScope": {
      const req = state.prd.functionalRequirements.find((r) => r.id === action.id);
      if (!req) return state;
      return {
        ...state,
        prd: {
          ...state.prd,
          functionalRequirements: state.prd.functionalRequirements.filter(
            (r) => r.id !== action.id,
          ),
          outOfScope: [...state.prd.outOfScope, { id: req.id, text: req.text }],
        },
      };
    }
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
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, { prd: null, comments: {}, chat: [] });
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const { error: backendError } = useServerSession();
  const [apiKey, setApiKey] = useApiKey();

  async function handleStart(ideaText: string) {
    setDrafting(true);
    setDraftError(null);
    try {
      const prd = await startDraft(ideaText, apiKey);
      dispatch({ type: "loadPrd", prd });
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : String(err));
    } finally {
      setDrafting(false);
    }
  }

  const flagCount = state.prd
    ? state.prd.functionalRequirements.filter((r) => r.flag).length
    : 0;

  return (
    /* Desktop-first per the design reference; below 1080px the page scrolls horizontally */
    <div className="flex h-screen min-w-[1080px] flex-col bg-canvas">
      {state.prd === null ? (
        <HomePage
          apiKey={apiKey}
          onApiKeyChange={setApiKey}
          backendError={backendError}
          drafting={drafting}
          draftError={draftError}
          onStart={handleStart}
        />
      ) : (
        <>
          <TopBar title={state.prd.title} version={state.prd.version} flagCount={flagCount} />
          <div className="flex min-h-0 flex-1">
            <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto px-[34px] pt-[34px] pb-[90px]">
              <PRDDocument
                prd={state.prd}
                comments={state.comments}
                onAddComment={(targetId, text) => dispatch({ type: "addComment", targetId, text })}
                onAcceptRewrite={(id) => dispatch({ type: "acceptRewrite", id })}
                onDismissFlag={(id) => dispatch({ type: "dismissFlag", id })}
                onMoveToOutOfScope={(id) => dispatch({ type: "moveToOutOfScope", id })}
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
