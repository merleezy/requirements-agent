# Requirements Agent

A tool that turns a rough project idea into a structured, complete, testable PRD through a guided multi-agent process.
The PRD is presented as an interactive document you can annotate, refine, and iterate on collaboratively with AI agents.

Requirements gathering is the highest-leverage, most-skipped stage of the SDLC.
A vague spec produces wrong code fast, especially in agentic workflows where the spec *is* the interface to the implementer.
This tool makes the clarify → draft → critique → revise → final review loop the actual product.

## How it works

1. **Clarify** — paste a rough idea; the Clarification Agent asks up to 8 targeted questions (0–3 for clear ideas, up to 8 for broad ones) to resolve genuine ambiguity before drafting begins.
2. **Draft** — the Drafting Agent turns the clarified idea into a structured PRD: problem statement, target users, goals, functional requirements (one behavior per sentence), out of scope, open questions.
3. **Critique** — the Critic Agent evaluates every functional requirement against a 5-dimension rubric (unambiguous, atomic, testable, scoped, traceable). It flags Defects (1–3) or Annotations (4–5), providing explicit assumptions or suggested rewrites.
4. **Revise** —
   - **Local Revision**: resolve individual requirement flags by accepting rewrites, providing feedback, grounding in scope, or moving items to out-of-scope.
   - **Global Revision**: comment on any section or provide whole-document feedback (`revise_global`), updating state wholesale while preserving user intent and re-running critic checks in the background.
5. **Final Engineering Review & Export** — before export, a lead software engineer review agent evaluates implementation risk and the 5-item Coherence Checklist (invariants, contradictions, entity lifecycle, per-context vs global scoping, open-question consistency).
   - Options to **Apply AI Fixes**, **Respond with custom design intent**, **Dismiss findings**, or **Export immediately** to Markdown.

## Model Configuration & Presets

Each stage runs on its own configurable model (via OpenRouter), with three curated presets:
- **Balanced (Recommended Default)**: Optimal mix of speed, reasoning, and cost (GLM 5.2 Air, GLM 5.2, DeepSeek V4 Flash, Claude Sonnet 5).
- **Budget (~95% quality at ~20% cost)**: High-speed, low-cost execution using DeepSeek V4 Flash, MiniMax M3, and GLM 5.2.
- **Max Quality**: Top-tier reasoning powered by Claude Sonnet 5, Claude Opus 4.8, and Claude Fable-5.

Per-stage model assignments can be customized anytime in the **Settings** page (`/api/models`).

## Bring Your Own Key

There are no user accounts and no database storage.
You supply your own OpenRouter API key, which lives only in your browser session and is attached per request.
It is never logged, never persisted, and never shared server-side.

## Architecture & Tech Stack

- **Frontend:** React + TypeScript + Vite, custom CSS theme tokens in `client/`
- **Backend:** Node + Express + TypeScript (session state in memory)
- **LLM Provider:** OpenRouter API (OpenAI-compatible HTTP client wrapper)
- **Export Engine:** Native Markdown downloader with gate validation

## Development & Running Locally

### Backend Server (`server/`)
```sh
cd server
npm install
npm run dev     # Express server on http://localhost:3001
npm test        # Run unit test suite (node --test)
```

### Frontend Client (`client/`)
```sh
cd client
npm install
npm run dev     # Vite dev server on http://localhost:5173
npm run build   # TypeScript check + Vite production bundle
```

*Note for WSL environments:* Run Node/npm commands inside WSL (nvm-managed) rather than Windows command line to prevent UNC path issues.

## Project Documents

- [docs/requirements-agent-spec.md](docs/requirements-agent-spec.md) — full product spec: pipeline, rubric, data model, architecture, security model
- [docs/agent-prompts.md](docs/agent-prompts.md) — finalized system prompts for all agents
- [design/prd-doc-reference.html](design/prd-doc-reference.html) — visual design reference for the PRD document view
- [CLAUDE.md](CLAUDE.md) — architectural rules, system context, and decision records

## Status

**Complete & Fully Functional**. The guided multi-agent pipeline (Clarify, Draft, Critic, Revise Local, Revise Global, Final Engineering Review, Settings, Export) is built, tested (97 unit tests passing), and verified for production build.
