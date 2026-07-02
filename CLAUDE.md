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

## Picking the right model for workflows and subagents

Rankings, higher = better. Cost reflects what I pay, not list price. Intelligence is how hard a problem you can hand the model unsupervised. Taste covers UI/UX, code quality, API design, and copy.

| Model    | Intelligence | Cost | Taste |
| -------- | ------------ | ---- | ----- |
| Fable-5  | 9            | 2    | 9     |
| Opus-4.8 | 7            | 4    | 8     |
| Sonnet-5 | 5            | 5    | 7     |

When delegating work to a subagent (via the Agent tool's `model` override), pick the model by task phase:

- Never use Haiku on this project, for any subagent, at any phase.
- Reviews of plans/implementation: fable-5 or opus-4.8
- Bulk/mechanical work (clear-spec implementation, data analysis, migrations): opus-4.8 or sonnet-5.
- Verification (running `preview_eval`, exercising the app, checking behavior against the spec): opus-4.8 or sonnet-5 - not fable-5.
- These are defaults, not limits.
  You have permission to override them: if a cheaper model's output doesn't meet the bar, rerun or redo the work with a smarter model without asking. Judge the output, not the price tag.
- Cost is a tie breaker only; when axes conflict for anything that ships, intelligence > taste > cost.
- Anything user-facing (UI, copy, API design) needs taste >= 7.
- Claude models (sonnet-5, opus-4.8, fable-5) run via the Agent/Workflow model parameter.

This is guidance for spawning subagents mid-session, not a claim that the primary agent can switch its own running model - it can't; that's controlled by the user via `/model`.

## Current stage

Build-order steps 1-6 are done.

Step 1 (Tailwind theme): tokens extracted from the design reference into `client/src/theme.css`, plus base components (`Button`, `SectionHeading`, `DimensionTag`).

Step 2 (static PRD document): the full document view over a hardcoded PRD (`client/src/data/samplePrd.ts`), all local state, no backend.
Components: `TopBar`, `PRDDocument`, `RequirementRow`, `CommentThread`, `ChatPanel`.
Client-side types in `client/src/types.ts` mirror the spec's data model and critic output shape.

Step 3 (Express backend skeleton + session state): standalone `server/` npm package (Express 5 + TypeScript), following the spec's suggested `/server` layout (`src/llm/modelConfig.ts`, `src/routes/`, `src/session/`, `src/types.ts`; `src/agents/` and `callLLM` arrive at step 5).
Routes so far: `GET /api/health`, `POST /api/session` (create), `GET /api/session` (fetch state).
In `server/`, `npm run dev` starts the server on port 3001 with `--watch`, and `npm run build` runs the type check; `.claude/launch.json` has a matching `server` entry.

Step 4 (home page + API key onboarding): `HomePage` component (idea textarea, BYOK key input with the spec's trust-signal copy, Start-drafting CTA), plus the client session layer in `client/src/state/` (`api.ts` fetch wrapper, `session.ts` with `useServerSession`/`useApiKey`).
The client now bootstraps a server session on load and recovers transparently when a stored session id has expired.

Step 5 (draft agent end to end): `server/src/agents/draft.ts` (verbatim prompt + typed input/output + user-message builder + output validator), `server/src/llm/callLLM.ts` (the one OpenRouter caller), and `POST /api/draft` (`server/src/routes/draft.ts`), which creates the `Project`, runs the draft agent, and stores the normalized PRD on the session.
On the client, `client/src/state/draft.ts` owns the draft call and the wire-to-UI PRD mapping; `App` now renders the real PRD instead of the sample, with drafting/error states surfaced on the home page footer.
Unit tests landed with it (spec exception to the testing deferral): `server npm test` covers `callLLM`, `modelConfig`, and the draft output validator with a stubbed global `fetch`.

Step 6 (clarify agent + Q&A view): `server/src/agents/clarify.ts` (verbatim prompt + typed input/output + round-aware user-message builder + validator), a `clarify` entry in the `callLLM` registry, and `POST /api/clarify` (`server/src/routes/clarify.ts`) serving both rounds.
`POST /api/draft` now accepts an optional `clarifications` array; shared input validators (`requireIdeaText`, `requireClarificationPairs`) moved into `server/src/routes/require.ts`.
On the client: `client/src/state/clarify.ts` (the two round calls), `ClarifyView` (the Q&A screen, extrapolated from the document card's design), and the `App` flow home → clarify → optional round 2 → draft; the shared wordmark was extracted into `components/Wordmark.tsx`.
Unit tests cover the clarify message builder and output validator alongside the draft ones.

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
- No client-side router: the app is a linear, session-scoped pipeline, so `App` switches views (`home` vs `document`) with plain state; revisit only if deep-linking ever matters.
- All client requests go through `client/src/state/api.ts`, which owns the `x-session-id` header and the server's uniform error shape - components never call `fetch` directly.
- Session bootstrap (`client/src/state/session.ts`): restore the id from `sessionStorage` and GET the session, fall back to POST-create on 404/absence; the bootstrap promise is memoized so StrictMode's double effect can't create two server sessions.
- The API key is held via `useApiKey` in `sessionStorage` (`ra.openrouterKey`), write-through on change, never `localStorage` - per the spec it will be attached per-request only at step 5.
- The home page extrapolates the document card's design (paper-tint masthead, numbered `SectionHeading` sections, mono kickers); "Draftsmith" (previously just the chat agent's name) doubles as the app wordmark.
- "Start drafting" requires a non-empty idea, a key, and a reachable backend; since step 5 it runs the real draft agent and the sample PRD is no longer shown anywhere (its file stays as reference data and still exports the generic chat chips).
- `Button` gained a `cta` size and shared disabled styling (`opacity-45`, no pointer events).
- `callLLM(stage, input, ctx)` resolves everything per stage from a registry inside `callLLM.ts` that maps the stage to its agent file's `{ prompt, buildUserMessage, parseOutput }`; agent files own their prompt, typed input/output, and validation, `callLLM` owns only the transport.
  New stages (clarify/critic/revise) join by adding one registry entry.
- LLM responses are non-streaming for v1: every agent returns one JSON object and no UI consumes partial output; revisit only if draft latency becomes a UX problem.
- The user's key travels in an `x-openrouter-key` header, read per request via `requireApiKey` and passed down the call stack only - never stored on the session, never part of a recorded `AgentRun`, and expected HttpErrors are not logged at all.
- `callLLM` error mapping to the uniform error shape: upstream 401/403 → `401 LLM_UNAUTHORIZED`, 402 → `LLM_PAYMENT_REQUIRED`, 429 → `LLM_RATE_LIMITED`, other non-2xx → `502 LLM_ERROR`, network failure → `502 LLM_UNREACHABLE`, 120s timeout → `504 LLM_TIMEOUT`, unparseable/wrong-shape reply → `502 LLM_BAD_OUTPUT`.
  Errors are `HttpError` instances (`server/src/errors.ts`) recognized by the app-level handler; Express 5 forwards async throws natively.
- `AgentRun`s are recorded only for successful calls; failures surface as errors and leave no run behind.
- Requirement ids returned by the draft model are discarded; the server assigns stable ids (`FR-1`…) so critic flags and annotations always have a reliable target.
  `POST /api/draft` commits `project`/`prd` to the session only after the LLM call succeeds.
- The draft agent produces `title` and `summary` fields (prompt revision 2026-07-01, approved); the title is stored on `Project`, the summary on the PRD (`summary` field added to the server PRD type), and the client masthead renders both directly - no mechanical derivation.
- The server PRD keeps non-requirement sections as plain string arrays; the client wraps them in commentable `PrdItem`s with deterministic position-based ids (`ps`, `tu-n`, `g-n`, `oos-n`, `oq-n`) so they can be re-derived server-side when annotations sync at step 9.
- The document version stays fixed at "Draft v1" until the revise loop (step 9) introduces versioning.
- All five prompts got a user-approved revision pass on 2026-07-01 - see the "Revisions" section at the bottom of `docs/agent-prompts.md` for the list and reasoning.
  Load-bearing consequences for later steps: models never mint ids (the server assigns them, including clarify question ids at step 6 and new-requirement ids at step 9); atomic splits arrive one-requirement-per-line in `suggestedRewrite`/`revisedText`, so steps 7/9 split on newlines; the critic's user message must include the original idea; revise-global's `otherSectionChanges` covers all five non-requirement sections with full-replacement semantics.
- After a draft, the chat seeds one locally-generated Draftsmith greeting (deterministic, not an LLM reply) stating the requirement count; real chat replies arrive with revise-global.
- Server unit tests run via `node --test 'src/**/*.test.ts'` (Node's built-in runner on natively-stripped TS, no test deps); `fetch` is stubbed at the global level.
- Clarify prompt revised again on 2026-07-01, ahead of step 6, per a second user-approved pass (see `docs/agent-prompts.md` Revisions): it must always ask new-product-vs-existing-product when unclear, and (if existing) ask enough about the existing product to ground new requirements in real context - there is no repo-connection mechanism in v1, so this is the only lever available.
  The flat 5-question cap became a scaling rule (2-4 typical, hard ceiling of 8 for genuinely vague ideas) with explicit anti-padding/anti-early-stop language.
  Load-bearing consequence for step 6: the clarify Q&A view needs to comfortably support more than 5 questions in the UI, and answers should be sent back to `revise`/`draft` paired with question _text_, not ids, since the server owns question identity (models mint no ids per the first revision pass).
- One `POST /api/clarify` route serves both rounds, distinguished by body shape: `{ ideaText }` is round 1 (and resets any previous clarify state, so a fresh idea or a failed call just starts over), `{ answers }` is round 2 (reusing the session's stored idea).
  Unlike `/api/draft` it returns only `{ questions }` - the questions generated by that call - not full session state; the client drives the flow.
- The 2-round clarify cap is enforced server-side, not just in the prompt: `400 CLARIFY_NOT_STARTED` for answers before questions, `400 CLARIFY_ROUNDS_EXHAUSTED` past round 2.
  Clarify state commits to the session only after the LLM call succeeds (same pattern as draft), so failures are simply retryable.
- Session state gained a `clarify` field: `{ ideaText, roundsUsed, questions }` with server-assigned `CQ-n` ids numbered across rounds.
  Answers are deliberately NOT stored server-side - the client owns them and sends them (paired with question text) to clarify round 2 and to draft, per the revision-pass decision above.
- A skipped question travels as an empty `answer` string and is rendered as "(no answer provided)" in agent user messages (shared `formatClarifications` in `server/src/agents/clarifications.ts`, used by clarify round 2 and draft).
  Rationale: the model treats skipped ambiguity as deliberately unresolved - draft surfaces it in `openQuestions` instead of guessing, and clarify round 2 doesn't re-ask it.
  Every answer is optional in the UI for the same reason.
- Round 2 runs automatically when round-1 answers are submitted (one extra cheap-model call); if it returns no questions the draft starts immediately, so the user never sees an empty screen.
- `parseClarifyOutput` truncates past the prompt's 8-question ceiling instead of failing the call - a model that overshoots produces a degraded result, not an error.

- Build-order step 7 (critic agent + inline flags) landed.
- `criticPrompt` and output parser check requirements against the 5 rubric dimensions.
- `POST /api/critic` runs the critic agent over PRD requirements with concurrency limiting.
- Local revision calls (`POST /api/revise-local`) apply requirement edits immediately without inline critic delays.
- The client triggers background critic checks asynchronously after revisions to avoid blocking the UI.
- Optimistic UI updates apply rewrite and judgment resolutions instantly to the document state.
- Requirements confirmed as-is store `acceptedAsIs = true`, bypassing redundant LLM calls on subsequent critic passes.
- System prompts for local revisions explicitly enforce spacing and word preservation.
- Document actions and inline section comments send user-role chat messages (`role: "user"`) rendered in dark chat bubbles on the right side of the chat panel.
- Direct user chat input (the text box at the bottom of the chat panel) allows sending custom, freeform messages to Draftsmith at any time for whole-PRD feedback (`revise_global`).
- Suggested follow-up chips (`chatChips`) are currently static sample chips in `samplePrd.ts` and will be dynamically generated from PRD context and open questions during the step 9 revise-global loop.
- Export functionality is scheduled for step 10, exporting the complete PRD to Markdown and JSON once the critic rubric export gate passes.

Step 8 (settings page) landed.
`SettingsPage` (client) is a centered card in the home/clarify visual language: preset cards (section 01), five per-stage model dropdowns grouped by provider with a per-1M-token pricing hint (section 02), and an explicit Save.
Entry points: a "Model settings" link next to the wordmark on the home page and a neutral "Settings" button in the document `TopBar`; settings overlays whichever view is current via plain `App` state (consistent with the no-router decision).
`client/src/state/settings.ts` owns the data layer (catalog fetch, config fetch via `GET /api/session`, save).
Decisions made at step 8, flagged per the rule above:

- `GET /api/models` proxies OpenRouter's public `/models` list server-side (`server/src/llm/models.ts`) instead of the client fetching it directly: one shared 1h cache across sessions, the API's uniform error shape, and no CORS dependency.
  The endpoint needs no session and no API key (the upstream list is public); stale cache is served if a refetch fails, and non-text-output models are filtered out.
- The three presets live next to `defaultModelConfig` in `server/src/llm/modelConfig.ts` and ride along in the `GET /api/models` response; "Balanced" IS `defaultModelConfig` (one source of truth).
  Budget = `deepseek/deepseek-v4-flash` everywhere; Max quality = `anthropic/claude-sonnet-5` (clarify/critic) + `anthropic/claude-opus-4.8` (draft/revise).
- `PUT /api/session/model-config` is a strict full replacement: `parseModelConfig` requires exactly the five stages and rejects unknown keys, so a typo'd stage fails the save instead of silently keeping an old model.
  In the UI a preset click only fills the dropdowns; nothing applies until Save (spec: "Saving writes to this config object in session state").
- Unit tests landed with it (the `modelConfig` piece of the testing exception): `parseModelConfig` validation, preset coverage, and the models-list cache (parse/filter, cache hit, stale-on-failure) with stubbed global `fetch`.

Step 9 (annotation → revise-global loop) landed.
`server/src/agents/reviseGlobal.ts` (verbatim prompt including its trailing NOTE paragraph), a `revise_global` registry entry, and `POST /api/revise-global` (`{ feedback, targetId? }`), which applies the model's diff to the session PRD server-side.
On the client: chat sends and item comments both run the global loop (`client/src/state/reviseGlobal.ts`), Draftsmith replies land in chat (and in the originating comment thread), and the background critic re-checks whatever the pass touched.
Decisions made at step 9, flagged per the rule above:

- Comments and chat are one mechanism: both go through `revise_global`; a comment just carries a `targetId` (a requirement id or one of the client's deterministic section-item ids, which the server re-derives positionally) that the user-message builder describes to the model.
  An `Annotation` (`A-n`, server-assigned) is recorded only for targeted comments, with `agentResponse` = the summary and `resolved` = whether anything was applied.
- The revise-global user message includes the original idea text - the prompt's "grounded in the idea/goals/feedback" rule is unjudgeable without it (same rationale as the critic revision of 2026-07-01).
- The revise-global prompt has no prose reply field and prompts are used verbatim, so Draftsmith's reply is a server-built deterministic diff summary (updated/added/removed ids, rewritten sections), returned as `summary` and reused for the annotation.
- Versioning: the server PRD gained `version` (draft = 1); an applied global pass bumps it, local revisions deliberately don't. The client renders `Draft v{n}`.
- The server PRD also gained `nextRequirementNumber`, a monotonic counter for new `FR-n` ids, so an id removed by a revision is never reissued to a different requirement (annotations/agent runs referencing the old id would silently repoint otherwise).
- Applying the diff is tolerant of model noise: unknown changed/removed ids are skipped silently (a hallucinated id must not fail the pass); multi-line `revisedText` splits into `${id}.1`-style sub-ids exactly like revise-local; a non-null `otherSectionChanges` field is a full replacement, and an empty array is valid ("clear the section").
- The critic re-check after a global pass is client-triggered in the background over `changedRequirementIds + newRequirementIds` (same responsiveness decision as revise-local; the route stays fast).
- One global pass runs at a time: `chatBusy` disables the chat input/chips and shows a pending bubble; a comment posted mid-flight stays local with a chat notice asking to repost.
- Chat chips are deterministic client-side derivations (`client/src/state/chips.ts`): up to 3 "Make a call on: ..." chips handing an open question back to Draftsmith (the sent message explicitly delegates the judgment), or one generic tighten-wording chip when none are open. Chips are `{ label, message }` - short label, fuller sent text.
- The full server→client PRD mapping (`toClientPrd`) moved into `client/src/state/prdMapping.ts`, shared by draft and revise-global.
- Route tests drive a real express app on an ephemeral port with global fetch stubbed only for the OpenRouter URL; UI verification stubbed the four LLM-backed `/api` endpoints in the page and exercised the full document flow in the browser without a key.

Next: build-order step 10 - export (PRD → Markdown / JSON, gated on the critic rubric).

The spec's build order was updated to close a gap found after step 2: the original 8 steps only ever produced the PRD document view, with no scheduled page for idea input, API key onboarding, or model settings.
It's now 10 steps - see `docs/requirements-agent-spec.md`'s "Suggested build order" section for the current numbering and the reasoning for where the two new steps (home/onboarding at step 4, settings at step 8) were inserted.
Steps 1-3 are unaffected by the renumbering.
None of the new pages are designed yet (see reading note above - only the PRD document view has a design reference), so they'll need the same "extrapolate consistently" treatment when their turn comes.

Testing/CI/CD/logging: deliberately deferred until the pipeline is wired end to end - see the spec's "Testing & production hardening (deferred)" section for the reasoning and the revisit trigger.
Exception: unit tests for the critic rubric and the `callLLM`/`modelConfig` abstraction should land as those pieces get built (steps 5, 7, 9), not held back with everything else.
