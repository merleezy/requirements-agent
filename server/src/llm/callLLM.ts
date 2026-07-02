import { HttpError } from "../errors.ts";
import type { Session } from "../session/store.ts";
import {
  buildDraftUserMessage,
  draftPrompt,
  parseDraftOutput,
} from "../agents/draft.ts";

/*
 * The one function that talks to OpenRouter (spec: "No LLM call is ever
 * inline in a route handler"). Route handlers call callLLM(stage, input, ctx);
 * they never construct an upstream request themselves.
 *
 * - The model is resolved from the session's modelConfig[stage].model, never
 *   a literal at the call site.
 * - Each stage's prompt/message-building/validation lives in its agent file
 *   under /agents; this file only knows the registry below and the transport.
 * - The user's API key arrives in ctx per call, goes into the Authorization
 *   header of the upstream request, and nowhere else: never logged, never
 *   stored on the session, never part of the recorded AgentRun.
 * - Responses are non-streaming for v1: every agent returns one JSON object,
 *   and no UI consumes partial output.
 * - Successful calls are recorded on session.agentRuns; failed calls throw an
 *   HttpError (LLM_* codes) and are not recorded.
 */

interface AgentDefinition<I, O> {
  prompt: string;
  buildUserMessage: (input: I) => string;
  parseOutput: (raw: unknown) => O;
}

/* Stage registry. Clarify/critic/revise agents join here as their
 * build-order steps land (6, 7, 9). */
const agents = {
  draft: {
    prompt: draftPrompt,
    buildUserMessage: buildDraftUserMessage,
    parseOutput: parseDraftOutput,
  },
} as const;

export type ImplementedStage = keyof typeof agents;

type AgentInput<S extends ImplementedStage> = Parameters<
  (typeof agents)[S]["buildUserMessage"]
>[0];
type AgentOutput<S extends ImplementedStage> = ReturnType<
  (typeof agents)[S]["parseOutput"]
>;

export interface CallContext {
  session: Session;
  /* Attached per request only - see key-handling rules in the spec. */
  apiKey: string;
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 120_000;

export async function callLLM<S extends ImplementedStage>(
  stage: S,
  input: AgentInput<S>,
  ctx: CallContext,
): Promise<AgentOutput<S>> {
  /* TS can't correlate a generic key with the registry's per-stage types
   * (the classic correlated-union limitation), so assert the pairing the
   * registry itself guarantees. */
  const agent = agents[stage] as unknown as AgentDefinition<
    AgentInput<S>,
    AgentOutput<S>
  >;
  const model = ctx.session.modelConfig[stage].model;
  const userMessage = agent.buildUserMessage(input);

  let res: Response;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: agent.prompt },
          { role: "user", content: userMessage },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new HttpError(
        504,
        "LLM_TIMEOUT",
        `The ${stage} model did not respond within ${TIMEOUT_MS / 1000}s.`,
      );
    }
    throw new HttpError(502, "LLM_UNREACHABLE", "Could not reach OpenRouter.");
  }

  if (!res.ok) {
    throw await upstreamError(stage, res);
  }

  const data: unknown = await res.json().catch(() => null);
  const content = extractContent(data);
  if (content === null) {
    throw new HttpError(
      502,
      "LLM_BAD_OUTPUT",
      `OpenRouter returned no message content for the ${stage} stage.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(content));
  } catch {
    throw new HttpError(
      502,
      "LLM_BAD_OUTPUT",
      `The ${stage} model did not return valid JSON.`,
    );
  }

  let output: AgentOutput<S>;
  try {
    output = agent.parseOutput(parsed);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new HttpError(502, "LLM_BAD_OUTPUT", `The ${stage} model returned an unexpected shape: ${detail}`);
  }

  /* Pipeline history (spec: AgentRun) - input/output only, never the key. */
  ctx.session.agentRuns.push({
    stage,
    input,
    output,
    timestamp: new Date().toISOString(),
  });

  return output;
}

/* Maps upstream failures onto the API's uniform error shape. The upstream
 * error message is passed through (it never contains the key); the request
 * we sent is not. */
async function upstreamError(stage: string, res: Response): Promise<HttpError> {
  const body: unknown = await res.json().catch(() => null);
  const upstreamMessage =
    typeof body === "object" &&
    body !== null &&
    typeof (body as { error?: { message?: unknown } }).error?.message === "string"
      ? ((body as { error: { message: string } }).error.message)
      : `OpenRouter returned HTTP ${res.status}`;

  if (res.status === 401 || res.status === 403) {
    return new HttpError(401, "LLM_UNAUTHORIZED", "OpenRouter rejected the API key.");
  }
  if (res.status === 402) {
    return new HttpError(402, "LLM_PAYMENT_REQUIRED", upstreamMessage);
  }
  if (res.status === 429) {
    return new HttpError(429, "LLM_RATE_LIMITED", upstreamMessage);
  }
  return new HttpError(502, "LLM_ERROR", `${stage} stage failed: ${upstreamMessage}`);
}

function extractContent(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  return typeof message?.content === "string" ? message.content : null;
}

/* Models sometimes wrap JSON in a markdown fence despite the prompt. */
function stripCodeFences(content: string): string {
  const trimmed = content.trim();
  const match = /^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```$/.exec(trimmed);
  return match ? match[1] : trimmed;
}
