# Requirements Agent

A tool that turns a rough project idea into a structured, complete, testable PRD through a guided multi-agent process.
The PRD is presented as an interactive document you can annotate and iterate on collaboratively with the agent.

Requirements gathering is the highest-leverage, most-skipped stage of the SDLC.
A vague spec produces wrong code fast, especially in agentic workflows where the spec *is* the interface to the implementer.
This tool makes the clarify → draft → critique loop the actual product.

## How it works

1. **Clarify** - you paste a rough idea; a clarifying agent asks up to five targeted questions (max two rounds) to resolve genuine ambiguity before anything is drafted.
2. **Draft** - a drafting agent turns the clarified idea into a structured PRD: problem statement, target users, goals, functional requirements, out of scope, open questions.
3. **Critique** - a critic agent checks every functional requirement against a five-dimension rubric, in priority order: unambiguous, atomic, testable, scoped, traceable.
   It flags exactly one failing dimension per requirement per pass, so ambiguity always resolves before testability.
4. **Revise** - comment on any section or requirement and the agent revises just that part; whole-document feedback goes through a global revision pass.
   Anything touched is automatically re-run through the critic.
5. **Export** - to markdown or JSON. A flagged-but-unresolved requirement blocks export, so a vague requirement can never quietly ship.

Each stage runs on its own configurable model (via OpenRouter), tiered by task: cheap/fast models for clarifying and rubric-checking, stronger models for drafting and revising.

## Bring your own key

There are no accounts and no server-side storage.
You supply your own OpenRouter API key, which lives only in your browser session and is attached per request.
It is never logged, never persisted, and never shared between sessions - the browser tab is the session boundary.

## Stack

- **Frontend:** React + TypeScript + Vite, with a custom Tailwind (v4) theme in `client/`
- **Backend:** Node + Express (session state in memory, no database)
- **LLM provider:** OpenRouter (OpenAI-compatible format, so direct provider keys are a natural later addition)

## Development

```sh
cd client
npm install
npm run dev     # Vite dev server on http://localhost:5173
npm run build   # type-check + production build
```

Note for this repo's dev environment: the project lives on the WSL filesystem, so run node/npm inside WSL (nvm-managed), not from Windows.
Windows npm fails on `\\wsl.localhost` UNC paths.

## Project documents

- [docs/requirements-agent-spec.md](docs/requirements-agent-spec.md) - full product spec: pipeline, rubric, data model, architecture, security model
- [docs/agent-prompts.md](docs/agent-prompts.md) - the five finalized agent system prompts
- [design/prd-doc-reference.html](design/prd-doc-reference.html) - visual design reference for the PRD document view (decoded copy in `design/_extracted/`)
- [CLAUDE.md](CLAUDE.md) - working agreements and architecture rules for agent-assisted development

## Status

Early development, following the build order in the spec.
Done so far: Tailwind theme (tokens + base components).
Next: static PRD document component.
