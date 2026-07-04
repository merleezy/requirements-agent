# Requirements Agent

Live link: https://requirements-agent.vercel.app/

A tool that turns a rough project idea into a structured, complete, testable PRD through a guided multi-agent process.
The PRD is presented as an interactive document you can annotate, refine, and iterate on collaboratively with AI agents.

Requirements gathering is the highest-leverage, most-skipped stage of the SDLC.
A vague spec produces wrong code fast, especially in agentic workflows where the spec *is* the interface to the implementer.
This tool makes the clarify -> draft -> critique -> revise -> final review loop the actual product.

## How it works

1. **Clarify** - paste a rough idea; the Clarification Agent asks targeted questions to resolve genuine ambiguity before drafting begins (2-4 for a typical idea, a hard ceiling of 8, at most two rounds; every question is skippable).
2. **Draft** - the Drafting Agent turns the clarified idea into a structured PRD: problem statement, target users, goals, functional requirements (one behavior per sentence), out of scope, open questions.
3. **Critique** - the Critic Agent checks every functional requirement against a 5-dimension rubric (unambiguous, atomic, testable, scoped, traceable), flagging one issue per requirement per pass: a defect (dimensions 1-3, with a suggested rewrite where safe) or a judgment call (dimensions 4-5, for you to confirm).
4. **Revise** -
   - **Local**: resolve an individual flag by accepting the suggested rewrite, replying with your own feedback, confirming intent, or moving the requirement out of scope.
   - **Global**: comment on any section or chat with Draftsmith about the whole document (`revise_global`); the change is applied as a diff and the critic re-checks whatever it touched in the background.
5. **Final review and export** - a lead-engineer review agent gives a go/no-go verdict on implementation risk, walking a 5-item coherence checklist (sum/balance invariants, contradictions and derived views, entity lifecycle, per-context vs global scoping, open-question consistency).
   Only high-severity findings block; medium/low findings ride along as non-blocking notes.
   Each finding can be resolved three ways: **Apply Fix** (the reviewer's recommendation), **Respond** (your own direction for how to handle it), or **Dismiss** (accepted risk, never re-raised on re-runs).
   Export downloads the PRD as Markdown.

## Model configuration and presets

Each pipeline stage runs on its own configurable model (via OpenRouter), with three curated presets:

- **Balanced** (default): GLM 5.2 for clarify/draft/local revision, DeepSeek V4 Flash for the critic, Claude Sonnet 5 for global revision and final review.
- **Budget** (~95% of quality at ~20% of the cost): DeepSeek V4 Flash, MiniMax M3, and GLM 5.2.
- **Max quality**: Claude Sonnet 5, Claude Opus 4.8, and Claude Fable 5 on every stage.

Per-stage model assignments can be customized anytime on the Settings page, which lists the live OpenRouter catalog with per-1M-token pricing.

## Bring your own key

There are no user accounts and no database storage.
You supply your own OpenRouter API key, which lives only in your browser session and is attached per request.
It is never logged, never persisted, and never shared server-side.

## Architecture and tech stack

- **Frontend:** React + TypeScript + Vite, Tailwind v4 with CSS-first theme tokens extracted from the design reference, in `client/`
- **Backend:** Express 5 + TypeScript on Node 24 native type stripping (no build step), session state in memory, in `server/`
- **LLM provider:** OpenRouter, called through a single `callLLM(stage, input)` transport; each agent's prompt, input/output types, and output validation live in one file under `server/src/agents/`
- **Export:** client-side Markdown download, gated behind the final review

## Development and running locally

### Backend server (`server/`)
```sh
cd server
npm install
npm run dev     # Express server on http://localhost:3001
npm test        # unit test suite (node --test, 97 tests)
npm run build   # type check (tsc --noEmit)
```

### Frontend client (`client/`)
```sh
cd client
npm install
npm run dev     # Vite dev server on http://localhost:5173 (proxies /api to 3001)
npm run build   # TypeScript check + Vite production bundle
```

*Note for WSL environments:* run Node/npm commands inside WSL (nvm-managed) rather than from Windows, to avoid UNC path issues.

## Project documents

- [docs/requirements-agent-spec.md](docs/requirements-agent-spec.md) - full product spec: pipeline, rubric, data model, architecture, security model
- [docs/agent-prompts.md](docs/agent-prompts.md) - the agent system prompts, with a revision log explaining every change
- [design/prd-doc-reference.html](design/prd-doc-reference.html) - visual design reference for the PRD document view
- [CLAUDE.md](CLAUDE.md) - architectural rules, system context, and decision records

## Status

All ten build-order steps are implemented: the full pipeline (clarify, draft, critic, local and global revision, final review), the home/onboarding page, model settings, and gated Markdown export.
The server has 97 unit tests (agents' message builders and output validators, `callLLM`, model config, routes); broader testing, CI/CD, and logging are deliberately deferred per the spec.
