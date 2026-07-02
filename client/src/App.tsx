import { useReducer, useState } from "react";
import { ChatPanel } from "./components/ChatPanel";
import { HomePage } from "./components/HomePage";
import { PRDDocument } from "./components/PRDDocument";
import { TopBar } from "./components/TopBar";
import { chatChips, samplePrd, seedChat, seedComments } from "./data/samplePrd";
import { useApiKey, useServerSession } from "./state/session";
import type { ChatMessage, Comment, PRD } from "./types";

/*
 * Steps 2 + 4: home page (idea input + key onboarding) in front of the PRD
 * document view. The app is a linear session-scoped pipeline, so views are
 * switched with plain state, not a router. Until the draft agent lands
 * (step 5), starting a project shows the hardcoded sample PRD as a stand-in
 * and the idea text is only held in state; document interactions still
 * mutate local state only.
 */

interface AppState {
  prd: PRD;
  comments: Record<string, Comment[]>;
  chat: ChatMessage[];
}

type Action =
  | { type: "acceptRewrite"; id: string }
  | { type: "dismissFlag"; id: string } /* Decline / Accept as-is */
  | { type: "moveToOutOfScope"; id: string }
  | { type: "addComment"; targetId: string; text: string }
  | { type: "sendChat"; text: string };

function reducer(state: AppState, action: Action): AppState {
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
  const [state, dispatch] = useReducer(reducer, {
    prd: samplePrd,
    comments: seedComments,
    chat: seedChat,
  });
  /* null = no project started yet (home view). Sent to the draft agent at step 5. */
  const [ideaText, setIdeaText] = useState<string | null>(null);
  const { error: backendError } = useServerSession();
  const [apiKey, setApiKey] = useApiKey();

  const flagCount = state.prd.functionalRequirements.filter((r) => r.flag).length;

  return (
    /* Desktop-first per the design reference; below 1080px the page scrolls horizontally */
    <div className="flex h-screen min-w-[1080px] flex-col bg-canvas">
      {ideaText === null ? (
        <HomePage
          apiKey={apiKey}
          onApiKeyChange={setApiKey}
          backendError={backendError}
          onStart={setIdeaText}
        />
      ) : (
        <>
          <TopBar title="Receipt Capture" version={state.prd.version} flagCount={flagCount} />
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
