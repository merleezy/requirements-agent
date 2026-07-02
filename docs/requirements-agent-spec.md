# Requirements Agent — v1 Spec

*A tool that turns a rough project idea into a structured, complete, testable PRD through a guided multi-agent process, presented as an interactive document you can annotate and iterate on collaboratively with the agent.*

---

## Why this project

Requirements gathering is the highest-leverage, most-skipped stage of the SDLC. A vague spec produces wrong code fast — especially in an agentic workflow where the spec *is* the interface to the implementer. This tool makes the clarify → draft → critique loop the actual product, with an interactive document as the surface.

It also doubles as a portfolio differentiator: it demonstrates agent orchestration (multiple roles, state passed between them, a self-checking loop) rather than "wrapped an LLM in a chat box," and it's meta in a way that's easy to explain in an interview.

**Definition of done for v1:** I can paste a rough idea, answer clarifying questions, get a structured PRD, see vague/untestable requirements flagged, comment on specific parts, and have the agent revise those parts — all in one session.

---

## v1 scope

**In:**
- Freeform idea input
- Clarify agent: generates targeted questions → user answers
- Draft agent: produces structured PRD (fixed sections)
- Critic agent: flags vague / untestable / missing items inline
- Interactive layer: PRD shown as organized sections; comment on specific parts; send feedback → agent revises that part
- Export PRD to markdown / JSON

**Out (explicitly, for v1):**
- Stage-4 "convert PRD to technical breakdown / task list" (great v2 feature)
- Persistence beyond a single session / any database
- Multi-user, auth, accounts — intentional, not just deferred: session-scoped BYOK removes the need for accounts entirely (see API key handling below)
- Matching an external design system

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  React + TS frontend (own Tailwind theme)    │
│  - Idea input                                │
│  - Clarifying Q&A view                        │
│  - PRD document (annotatable component tree)  │
│  - Comment / feedback UI per section          │
│  - Settings: API key + per-stage model config │
│  - Key lives in browser session only          │
└───────────────────┬─────────────────────────┘
                    │  (REST, key attached per-request only)
┌───────────────────┴─────────────────────────┐
│  Node / Express backend                      │
│  - Orchestrates the agent pipeline           │
│  - Holds PRD/session state in memory          │
│  - Forwards LLM calls; never logs/stores key  │
└───────────────────┬─────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │  OpenRouter (OpenAI-  │
        │  compatible format)   │
        │  routes to whichever  │
        │  model each stage's   │
        │  config points to     │
        └───────────────────────┘
```

The interactive document is **React state**, not generated HTML files. Annotations, requirement statuses, and agent revisions are all state updates — no HTML parsing or file round-tripping.

**v1 provider: OpenRouter.** One integration gives access to Anthropic, DeepSeek, MiniMax, GLM, and dozens of other models through a single key and a single request format, which makes both development (cheap iteration while tuning prompts) and later multi-provider support (already provider-agnostic by construction) essentially free side effects of the same design. Direct provider keys (Anthropic, OpenAI, etc.) are a natural v2 addition — same request shape, just a different base URL, since OpenRouter, Anthropic, and most open-weight providers all speak the OpenAI-compatible format.

---

## The agent pipeline

| Stage | Role | Model tier (example) | Output |
|-------|------|-----------|--------|
| 1. Clarify | Find ambiguities, ask targeted questions (max 2 rounds) | cheap/fast — e.g. DeepSeek V4 Flash | list of questions |
| 2. Draft | Turn clarified input into structured PRD | strong — e.g. GLM 5.2 or Claude Sonnet | full PRD (sections) |
| 3. Critic | Check each requirement against the rubric, one flag at a time | cheap/mid — e.g. DeepSeek V4 Flash | single next flag per requirement |
| 4. Revise (local) | Resolve one annotated requirement | strong — same tier as Draft | revised requirement, re-run through critic |
| 5. Revise (global) | Apply general/whole-PRD feedback | strong (full PRD context) | batch diff of changed/added requirements, auto re-run through critic |

The **model tiering is a deliberate design feature**, not an afterthought — it demonstrates cost-aware architecture. Clarify and critic are lower-reasoning (question generation, rubric checking); draft and revise benefit from a stronger model. Actual model choice per stage is user-configurable (see Model configuration below) — the table above shows sensible defaults, not hardcoded values.

**Why a separate critic pass, given a strong draft agent already wrote the PRD:** generation and evaluation are different cognitive tasks even at the same model capability. A generator is under pressure to produce something coherent and complete-looking, so it tends to quietly resolve ambiguity by guessing rather than surfacing it. A critic, whose only job is to check a narrow rubric per requirement, isn't under that same pressure — it's built to catch places where the draft agent silently resolved something instead of flagging it.

**Why clarify doesn't make the critic redundant:** clarify reduces ambiguity in the *input*, before any requirements exist. The draft agent inevitably introduces new unstated assumptions in the act of writing structured requirements (e.g. inferring "nested folders" when only "folders" was mentioned) — ambiguity clarify structurally cannot reach because it doesn't exist yet at that stage. Critic is the safety net for exactly that gap.

**Both loops (local and global) end the same way:** any requirement they touch gets auto re-run through the critic. This mirrors the export gate below — nothing should be able to slip into a "resolved" PRD without passing through the critic at least once after its most recent change.

---

## Model configuration

Every stage reads its model from a config object, never a hardcoded string:

```json
{
  "clarify":        { "model": "deepseek/deepseek-v4-flash" },
  "draft":           { "model": "z-ai/glm-5.2" },
  "critic":          { "model": "deepseek/deepseek-v4-flash" },
  "revise_local":    { "model": "z-ai/glm-5.2" },
  "revise_global":   { "model": "z-ai/glm-5.2" }
}
```

**Settings UI:** a dropdown per stage, populated by fetching OpenRouter's `/models` list (so new models appear automatically, no hand-maintained list). Saving writes to this config object in session state — no code touched to change a model.

**Presets** on top of the raw dropdowns, since picking five models by hand is a lot to ask by default: "Budget" (cheapest across the board), "Balanced" (mixed, e.g. the table above), "Max quality" (Claude/GPT-tier everywhere). Selecting a preset just writes all five values at once.

**v2 idea:** per-project model config (not just global), so the same idea can be run through different model mixes side by side for comparison — e.g. GLM 5.2's draft vs. Claude Sonnet's draft on the identical clarified input.

---

## API key handling & session security

The tool is **bring-your-own-key (BYOK)** — there is no shared or app-owned key. Each user supplies their own OpenRouter key (or, later, a direct provider key).

**Key never persists.** It lives only in the current browser session — in-memory React state, or `sessionStorage` if it needs to survive a page refresh (never `localStorage`, so it reliably clears when the tab closes). It is never written to a database, a log file, or any server-side store.

**Two possible request paths**, in order of preference:
1. **Direct client → OpenRouter.** The frontend calls OpenRouter's endpoint directly with the user's key attached. The backend never sees it at all. Requires confirming OpenRouter's API permits direct browser (CORS) requests — verify before committing to this path.
2. **Stateless backend passthrough (fallback).** If direct browser calls aren't viable, the backend receives the key only as part of a single forwarded request, relays it to OpenRouter, streams the response back, and discards it immediately — no logging, no storage, not even transiently written to disk.

**Why sessions don't collide.** Each browser tab is an isolated JS runtime with its own memory. Two people using the same public demo URL get two entirely separate app instances — there is no code path by which one session's key could reach another. This isn't an access-control rule being enforced; it's a structural consequence of not centrally storing keys anywhere they could be looked up or shared. If I paste my own key into a public demo, the next visitor's session starts empty — they never see or touch my key, and I never see or touch theirs.

**Trust signals, since "paste your key into a random web app" is a reasonable thing to be wary of:**
- Open source the repo — verifiable beats asserted.
- State the guarantee plainly next to the key input (e.g. "Used only to call OpenRouter directly; never stored on our servers").
- No accounts, no login, no password — the browser tab *is* the session boundary, so there's nothing to breach that would expose someone else's key.

**Standing rule for all future versions, including any v2 persistence:** the API key specifically must never be written to disk, database, or logs, even if other session data (like saved projects) starts persisting. This should hold even as the rest of the app's persistence story changes.

**Electron/desktop packaging** was considered as an alternative trust story (key definitely never leaves your machine), but a well-architected web app with client-side-only key handling achieves the same guarantee without the added build/packaging complexity — worth revisiting only if real users specifically want that reassurance later.

---

## Code organization (structural rules, not just behavior)

The sections above define what the system does. These rules constrain *how it's built in code* — they exist so architecture decisions don't get silently made by whichever agent or session happens to be writing a given file.

**No LLM call is ever inline in a route handler.** Every call to a model goes through one shared function (e.g. `callLLM(stage, input)`). Route handlers call that function; they never construct a request to OpenRouter directly. This is what keeps the provider/model layer swappable — if a call is inlined even once, that one path becomes hardcoded and the abstraction is broken.

**Prompts live in their own files, not as inline strings.** Each of the five agent prompts (clarify, draft, critic, revise-local, revise-global) is its own file/constant, imported by `callLLM`. Never paste a prompt string directly into a route or a component.

**Model config is one object, looked up by stage.** `callLLM(stage, input)` resolves the model to call by reading `modelConfig[stage].model` — never a literal model string passed at the call site. This is what makes the settings UI's dropdowns actually take effect without touching code.

**Suggested structure:**
```
/server
  /agents
    clarify.ts   draft.ts   critic.ts   reviseLocal.ts   reviseGlobal.ts
    (each exports its prompt + a typed input/output shape)
  /llm
    callLLM.ts   (the one function that talks to OpenRouter)
    modelConfig.ts
  /routes
    (route handlers — call callLLM, never construct requests themselves)
/client
  /components
    PRDDocument, RequirementCard, AnnotationPopup, SettingsPanel, ...
  /state
    (session state: PRD data, model config, API key — key never sent anywhere but request headers)
```

**API key discipline (cross-referencing the section above):** the key is read from client session state and attached per-request only. It is never written into `modelConfig`, never logged by `callLLM`, and never touches any persistence layer, present or future.

**Any time an agent (or you) makes an architecture decision not covered here** — e.g. how streaming responses are handled, how errors from `callLLM` propagate to the UI — it should be treated as worth a sentence of explanation before implementation, and ideally added back into this file so the next session doesn't have to re-decide it.

---

## Data model (core entities)

- **Project** — the idea text + metadata (title, created-at, current stage)
- **Requirement** — `{ id, text, type, status: draft|flagged|accepted, testable: bool, section }`
- **Annotation** — `{ id, targetId (requirement or section), userComment, agentResponse, resolved: bool }`
- **AgentRun** — `{ stage, input, output, timestamp }` — so the pipeline history is visible/debuggable

---

## The genuinely hard parts (spend real effort here)

These are the "ambiguous core" — worth strong-model help and careful design:

1. **The critic's rubric.** What makes a requirement "good"? (Testable? Unambiguous? Has acceptance criteria? In scope?) This is the intellectual core of the whole tool — everything else is plumbing around it.
2. **Annotation → targeted re-run.** Feeding just the relevant slice back to the agent with *enough* surrounding context to revise well, without re-running the whole pipeline.
3. **Per-agent prompt design.** Keeping each role in its lane so the clarifier doesn't start drafting and the critic doesn't rewrite.

Everything else (input UI, section rendering, comment boxes, Express routes, export) is well-specified plumbing — cheap-model / low-effort implementation work.

---

## The critic rubric

Five dimensions, checked in this priority order (most-fundamental first — a requirement is only checked against a later dimension once it passes everything before it):

| # | Dimension | Nature | Fails on (example) | Resolution |
|---|-----------|--------|---------------------|------------|
| 1 | Unambiguous | Defect | "categories and folders" — same thing or different? | Question-first. May propose a rewrite only with an explicitly labeled assumption — never a silent guess. |
| 2 | Atomic | Defect | "upload, crop, and tag a photo" — three behaviors in one line | Propose a split into separate requirements. |
| 3 | Testable | Defect | "search should work well" — no pass/fail condition | Propose a concrete rewrite (add metric / specific behavior). Safest dimension to auto-rewrite. |
| 4 | Scoped | Judgment | "nested folders" never mentioned in the original idea | No rewrite — confirm intent. Accept as-is / Modify / Remove. |
| 5 | Traceable | Judgment | Coherent, testable requirement tied to no stated goal | Surface the gap. Accept / Link to a goal / Remove. |

**Judgment-call dimensions (4-5) never get an auto-rewrite** — the requirement isn't broken, so there's nothing to fix; the critic is only asking the user to confirm intent.

**One flag per requirement per critic pass.** The critic returns only the first dimension (in priority order) that fails — not every failing dimension at once. Once the user resolves that one, the requirement is re-run through the critic, which then checks the next dimension against the now-cleaner requirement. This keeps each review interaction small and focused, and — more importantly — respects the real dependency between dimensions: a testable rewrite can't be trusted until the ambiguity underneath it is resolved, so surfacing testability before ambiguity risks baking in a guessed interpretation.

**Critic output shape** (per requirement, per pass):

```
{
  requirementId,
  passed: bool,
  dimension: "unambiguous" | "atomic" | "testable" | "scoped" | "traceable",
  nature: "defect" | "judgment",
  reason: string,
  suggestedRewrite: string | null,   // null for judgment dimensions, and for unresolved ambiguity; atomic splits put one requirement per line
  assumption: string | null          // populated only when proposing a rewrite for a previously-ambiguous item
}
```

**A requirement is "resolved"** when the critic, re-run after its most recent change, returns `passed: true`. This is the single condition the export gate checks — a flagged-but-untouched requirement blocks export (or at minimum warns loudly), so the tool's core value — never shipping a vague requirement — can't leak out the last step.

---

## PRD section structure (what the Draft agent produces)

Document metadata: a short title plus a one-sentence summary (the masthead subtitle).
Then the sections:

- Problem statement
- Target users
- Goals / success metrics
- Functional requirements (the list the Critic evaluates)
- Out of scope
- Open questions

---

## Suggested build order

1. Define the small Tailwind theme (own identity) — tokens, a couple of components
2. Static PRD document component (renders a hardcoded PRD nicely, annotatable) — proves the UI before any AI
3. Express backend skeleton + session state
4. Home page (freeform idea input, the "no PRD yet" state) + API key onboarding (BYOK entry into session-only storage, with the trust-signal copy from the "API key handling" section above)
5. Draft agent only (idea → PRD), wired end to end
6. Clarify agent + clarifying Q&A view (prepend the Q&A step — needs its own screen for the question/answer round-trip, not just the agent call)
7. Critic agent + inline flags
8. Settings page (per-stage model dropdowns populated from OpenRouter's `/models` list, plus the Budget/Balanced/Max-quality presets)
9. Annotation → revise loop
10. Export

Ship after each step works. The static-document-first order means you're never blocked on prompt design to see UI progress.

Steps 4 and 8 exist because the earlier draft of this order only ever produced the PRD document view — it never scheduled the pages the architecture section above already implies (idea input, key onboarding, model settings). Step 4 comes before the draft agent (step 5) because `callLLM` needs a key from somewhere before it can be wired end to end. Step 8 comes after critic (step 7) rather than earlier because by then all three of the initially-distinct model tiers (clarify, draft, critic) exist, so the settings page has something real to configure instead of a single dropdown.

---

## Testing & production hardening (deferred)

Deferred for now: CI/CD automation, structured logging infrastructure, and broad end-to-end test coverage.
The build order above isn't finished, and the pipeline's shape - what `callLLM` returns, how errors propagate to the UI, what session state looks like - is still being decided one step at a time.
Automating around an interface that's still changing would mean rewriting the harness a few times for no benefit.

Not deferred: lightweight unit tests for the two pieces the "genuinely hard parts" section above already flags as worth real effort - the critic rubric logic and the `callLLM` / `modelConfig` abstraction.
These are exactly the places where a silent regression (the critic returning more than one flag, a stage silently reading the wrong model) would be easy to miss in a quick review and easy to catch with a test.
Add these as each piece gets built (steps 5, 7, 9), not as a separate later pass.

Revisit trigger: once the pipeline is wired end to end (after step 9, annotation → revise loop), reconsider broader e2e coverage and a basic CI job (lint + build + unit tests on push) - before that point, step-by-step review is the regression safety net instead of automation.

---

## v2+ ideas (park these)

- Stage-4 handoff: PRD → technical breakdown / task list / data-model sketch
- Persistence (Mongo, matching Compass) so projects survive sessions — if built, the API key must stay excluded from whatever gets persisted (see standing rule above)
- Per-project model configuration, so the same idea can be run through different model mixes for comparison
- Direct provider keys (Anthropic, OpenAI, etc.) alongside OpenRouter — same request shape, just a different base URL
- Point it at an existing repo and match that project's styling (the Lavish-style meta move)
- Devlog / build-in-public series documenting the build
- Desktop packaging (Electron/Tauri) if users specifically want the "runs locally" trust story
