import { useState } from "react";
import { Button } from "./Button";
import { SectionHeading } from "./SectionHeading";

/*
 * Build-order step 4: the "no PRD yet" state - freeform idea input plus
 * BYOK key onboarding. No design reference exists for this page; it
 * extrapolates the PRD document card's language (masthead, numbered
 * sections, mono kickers) onto a single centered card.
 */

interface HomePageProps {
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  /* Non-null when the session bootstrap failed (e.g. server not running). */
  backendError: string | null;
  onStart: (ideaText: string) => void;
}

export function HomePage({ apiKey, onApiKeyChange, backendError, onStart }: HomePageProps) {
  const [idea, setIdea] = useState("");
  const canStart = idea.trim().length > 0 && apiKey.trim().length > 0 && !backendError;

  return (
    <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto px-[34px] pt-[64px] pb-[90px]">
      <div className="w-full max-w-[640px]">
        {/* Wordmark, echoing the chat panel's agent header */}
        <div className="mb-5 flex items-center gap-[9px]">
          <div className="flex h-[26px] w-[26px] items-center justify-center rounded-md bg-accent font-mono text-[10px] font-semibold text-white">
            AI
          </div>
          <div className="font-display text-[13px] font-semibold text-ink-950">Draftsmith</div>
          <div className="font-mono text-[10.5px] text-ink-400">requirements agent</div>
        </div>

        <div className="overflow-hidden rounded-lg border border-line-400 bg-paper shadow-doc">
          {/* Masthead */}
          <div className="border-b border-line-200 bg-paper-tint px-10 pt-8 pb-6">
            <div className="mb-[9px] font-mono text-[10px] font-medium tracking-[0.16em] text-ink-400 uppercase">
              New Project
            </div>
            <div className="font-display text-[27px] leading-[1.15] font-bold tracking-[-0.015em] text-ink-950">
              What are you building?
            </div>
            <div className="mt-1.5 text-[13.5px] leading-[1.5] text-ink-500">
              Describe your idea in plain words - rough is fine. Draftsmith asks what it needs to
              know, drafts a structured PRD, and flags every vague or untestable requirement for
              you to resolve.
            </div>
          </div>

          {/* Idea input */}
          <div className="border-b border-line-100 px-10 pt-5 pb-6">
            <SectionHeading number="01" title="Project idea" />
            <textarea
              rows={7}
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="e.g. A bookmarking app for design inspiration - save screenshots from the web, organize them, find them again by color or keyword…"
              className="mt-3.5 w-full resize-y rounded-lg border border-line-400 bg-white px-3.5 py-3 text-[14px] leading-[1.6] text-ink-950 outline-none placeholder:text-ink-300 focus:border-accent"
            />
          </div>

          {/* API key onboarding */}
          <div className="px-10 pt-5 pb-6">
            <SectionHeading number="02" title="OpenRouter API key" />
            <input
              type="password"
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder="sk-or-…"
              spellCheck={false}
              autoComplete="off"
              className="mt-3.5 w-full rounded-lg border border-line-400 bg-white px-3.5 py-2.5 font-mono text-[12.5px] text-ink-950 outline-none placeholder:text-ink-300 focus:border-accent"
            />
            {/* Trust-signal copy, per the spec's "API key handling" section */}
            <div className="mt-2.5 text-[12px] leading-[1.55] text-ink-500">
              Bring your own key - it is used only to call OpenRouter on your behalf. It lives in
              this tab&rsquo;s session storage, is never stored or logged on any server, and clears
              when the tab closes.{" "}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noreferrer"
                className="text-accent underline decoration-accent-line underline-offset-2 hover:decoration-accent"
              >
                Get a key
              </a>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-line-200 bg-paper-tint px-10 py-4">
            {backendError ? (
              <div className="font-mono text-[10.5px] font-medium text-defect">
                Backend unreachable - start the server, then reload.
              </div>
            ) : (
              <div className="font-mono text-[10.5px] font-medium text-ink-400">
                Next: clarifying questions · nothing runs until you start
              </div>
            )}
            <Button
              variant="solid"
              size="cta"
              disabled={!canStart}
              title={canStart ? undefined : "Enter an idea and your OpenRouter key first"}
              onClick={() => onStart(idea.trim())}
            >
              Start drafting
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
