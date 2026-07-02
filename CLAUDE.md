# CLAUDE.md

This file is read automatically at the start of every session.
Read it fully, along with the two files it references, before writing any code.

## Required reading before starting

1. `docs/requirements-agent-spec.md` - full product spec: pipeline, rubric, data model, architecture, security model.
   Read this first, in full.
2. `docs/agent-prompts.md` - the five finalized agent system prompts (clarify, draft, critic, revise-local, revise-global).
   Use these verbatim as the prompt content for each agent file - do not rewrite or "improve" them without flagging the change and why first.
3. `design/prd-doc-reference.html` - the design reference for the PRD document view (colors, typography, spacing).
   It is a self-unpacking JS bundle; a decoded, readable copy lives at `design/_extracted/template.html`.
   Extract the actual tokens/CSS from it rather than eyeballing it.
   The canonical extracted tokens live in `client/src/theme.css` - reuse those rather than re-deriving them.
   The rest of the app (settings, home, annotation popup) is NOT designed yet - extrapolate from this reference consistently rather than inventing an unrelated style.

## Non-negotiable architecture rules

These are structural, not preferences.
See the "Code organization" section of the spec for the full reasoning - this is the enforceable summary:

- No LLM call is ever inline in a route handler.
  Every call goes through one shared `callLLM(stage, input)` function.
- Each agent prompt lives in its own file under `/server/agents`, imported by `callLLM` - never pasted inline into a route or component.
- Model selection per stage is read from a single config object (`modelConfig[stage].model`), never a literal model string at the call site.
- The user's API key is read from client session state and attached per request only.
  It is never logged, never written to `modelConfig`, never persisted to disk/database - now or in any future feature.
- The critic returns exactly one flag per requirement per pass (the highest-priority failing dimension), never a list of all failing dimensions.
  See the rubric section of the spec if this constraint seems avoidable - it isn't; it's load-bearing for how revision resolves ambiguity before testability.

## Dev environment

- The repo lives on the WSL (Ubuntu) filesystem; agent shells run on Windows against a `\\wsl.localhost` UNC path.
  Windows npm cannot run npm scripts or lifecycle scripts there (cmd.exe rejects UNC working directories).
- Run all node/npm commands inside WSL, where node v24 is managed by nvm (source `~/.nvm/nvm.sh` first in non-interactive shells):
  `wsl.exe -e bash -c 'export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; cd ~/Code/requirements-agent/client && npm run build'`
- The frontend is `client/`: Vite + React + TypeScript + Tailwind v4 (CSS-first config; the theme is `@theme static` in `client/src/theme.css`, no `tailwind.config.js`).
- The backend is `server/`: Express 5 + TypeScript, run directly by Node 24's native type stripping (no build step, no tsx).
- `npm run build` verifies changes in both packages: type-check + production build in `client/`, type-check (`tsc --noEmit`) in `server/`.
- `.claude/launch.json` has `client` (Vite dev server, port 5173) and `server` (Express, port 3001) entries, both through wsl.exe; the Vite dev server proxies `/api` to 3001.

## How we'll work

- Follow the "Suggested build order" in the spec, one step at a time.
  Stop after each step for review rather than continuing on to the next.
- Before implementing anything non-trivial - the provider/model abstraction, the critic pipeline, the annotation → revise flow - describe the intended approach in a few sentences first.
  Wait for confirmation before writing the code, unless told otherwise.
- If you make an architecture decision that isn't covered in the spec or this file (e.g. how streaming responses are handled, how `callLLM` errors propagate to the UI), say so explicitly rather than deciding silently.
  Flag it as a decision, not just a fact.
  Ideally, add it back into this file so the next session doesn't have to re-decide it.
- Prefer working, reviewable increments over large unreviewed diffs.
  A smaller piece I can actually read beats a bigger piece I have to trust.

## Current stage

Build-order steps 1, 2, and 3 are done.

Step 1 (Tailwind theme): tokens extracted from the design reference into `client/src/theme.css`, plus base components (`Button`, `SectionHeading`, `DimensionTag`).

Step 2 (static PRD document): the full document view over a hardcoded PRD (`client/src/data/samplePrd.ts`), all local state, no backend.
Components: `TopBar`, `PRDDocument`, `RequirementRow`, `CommentThread`, `ChatPanel`.
Client-side types in `client/src/types.ts` mirror the spec's data model and critic output shape.

Step 3 (Express backend skeleton + session state): standalone `server/` npm package (Express 5 + TypeScript), following the spec's suggested `/server` layout (`src/llm/modelConfig.ts`, `src/routes/`, `src/session/`, `src/types.ts`; `src/agents/` and `callLLM` arrive at step 5).
Routes so far: `GET /api/health`, `POST /api/session` (create), `GET /api/session` (fetch state).
In `server/`, `npm run dev` starts the server on port 3001 with `--watch`, and `npm run build` runs the type check; `.claude/launch.json` has a matching `server` entry.

Decisions made so far, flagged per the rule above:

- Tailwind v4 CSS-first config via `@tailwindcss/vite`; `@theme static` so all tokens are emitted even before a utility references them (v4 prunes unreferenced tokens otherwise).
- Fonts (Space Grotesk, IBM Plex Sans, IBM Plex Mono) load from Google Fonts via a `<link>` in `client/index.html`; self-hosting the woff2s from the design bundle is a cheap swap later if wanted.
- Two near-duplicate reference grays were consolidated (#5b6570 → ink-600 #5b6b78, #cdd7df → line-600 #cfd8df); noted in a comment in `theme.css`.
- A requirement's flagged text span is stored as a `highlight` substring of `text` (rendered with a dotted underline), not as pre/mark/post fragments.
- The chat panel appends messages locally with no canned agent replies; the revise-global agent is wired in at step 7.
- The app is desktop-first with `min-w-[1080px]` (horizontal scroll below that); the reference only specifies a desktop layout.
- Sample-data copy is kept verbatim from the design reference, including punctuation.
- The server runs on Node 24's native type stripping - no build step, no tsx/ts-node; `server/npm run build` is a `tsc --noEmit` type check, and `erasableSyntaxOnly` + explicit `.ts` import extensions in `server/tsconfig.json` enforce what native stripping supports.
- Session identity: `POST /api/session` returns a server-generated UUID; the client will keep it in `sessionStorage` (alongside the API key, per the spec's session model) and send it in an `x-session-id` header on every request.
- Server session state holds `project`, `prd`, `annotations`, `agentRuns`, and a per-session `modelConfig` cloned from the "Balanced" defaults in `server/src/llm/modelConfig.ts` (spec: settings save into session state).
- Sessions expire after 24h idle (swept every 10 min); an unknown/expired id gets `404 SESSION_NOT_FOUND`, which the client treats as "create a fresh session", not an auth failure.
- API errors all use one shape, `{ error: { code, message } }`; the Express error handler logs only the error itself, never the request (headers will carry the user's key from step 5 on).
- Server types (`server/src/types.ts`) deliberately duplicate the client's data-model types rather than sharing a package; revisit sharing when the API contract firms up at step 5.
- Dev servers stay separate origins: Vite (5173) proxies `/api` to Express (3001) via `server.proxy` in `client/vite.config.ts`, so client code uses same-origin paths.

Next: build-order step 4 - home page (idea input) + API key onboarding.

The spec's build order was updated to close a gap found after step 2: the original 8 steps only ever produced the PRD document view, with no scheduled page for idea input, API key onboarding, or model settings.
It's now 10 steps - see `docs/requirements-agent-spec.md`'s "Suggested build order" section for the current numbering and the reasoning for where the two new steps (home/onboarding at step 4, settings at step 8) were inserted.
Steps 1-3 are unaffected by the renumbering.
None of the new pages are designed yet (see reading note above - only the PRD document view has a design reference), so they'll need the same "extrapolate consistently" treatment when their turn comes.

Testing/CI/CD/logging: deliberately deferred until the pipeline is wired end to end - see the spec's "Testing & production hardening (deferred)" section for the reasoning and the revisit trigger.
Exception: unit tests for the critic rubric and the `callLLM`/`modelConfig` abstraction should land as those pieces get built (steps 5, 7, 9), not held back with everything else.
