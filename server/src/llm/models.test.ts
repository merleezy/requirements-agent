import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { HttpError } from "../errors.ts";
import {
  expireModelListCache,
  fetchModelList,
  parseModelList,
  resetModelListCache,
} from "./models.ts";

/*
 * Unit tests for the model-catalog cache behind GET /api/models. fetch is
 * stubbed at the global level; no test talks to OpenRouter.
 */

const catalogReply = {
  data: [
    {
      id: "z-ai/glm-5.2",
      name: "Z.AI: GLM 5.2",
      pricing: { prompt: "0.0000006", completion: "0.0000022" },
      architecture: { modality: "text->text" },
    },
    {
      id: "deepseek/deepseek-v4-flash",
      name: "DeepSeek: DeepSeek V4 Flash",
      pricing: { prompt: "0.00000005", completion: "0.0000001" },
      architecture: { output_modalities: ["text"] },
    },
    {
      /* image-output model - must be filtered out */
      id: "test/image-gen",
      name: "Test: Image Gen",
      pricing: { prompt: "0.000001", completion: "0.000001" },
      architecture: { modality: "text->image" },
    },
    {
      /* no architecture info - kept rather than hidden */
      id: "test/unknown-arch",
      pricing: { prompt: "not-a-number" },
    },
  ],
};

let fetchCalls = 0;
const realFetch = globalThis.fetch;

function stubFetch(respond: () => Response | Promise<Response>): void {
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return respond();
  }) as typeof fetch;
}

function catalogResponse(): Response {
  return new Response(JSON.stringify(catalogReply), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  resetModelListCache();
  fetchCalls = 0;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

test("parses ids, names, and per-token prices, filtering non-text-output models", async () => {
  stubFetch(catalogResponse);

  const models = await fetchModelList();

  assert.deepEqual(
    models.map((m) => m.id),
    ["deepseek/deepseek-v4-flash", "test/unknown-arch", "z-ai/glm-5.2"],
  );
  const glm = models.find((m) => m.id === "z-ai/glm-5.2");
  assert.equal(glm?.name, "Z.AI: GLM 5.2");
  assert.equal(glm?.promptPrice, 0.0000006);
  const unknown = models.find((m) => m.id === "test/unknown-arch");
  assert.equal(unknown?.name, "test/unknown-arch");
  assert.equal(unknown?.promptPrice, null);
});

test("serves the cache on a second call instead of refetching", async () => {
  stubFetch(catalogResponse);

  await fetchModelList();
  await fetchModelList();

  assert.equal(fetchCalls, 1);
});

test("serves a stale cache when the refetch fails, and errors only with no cache at all", async () => {
  stubFetch(catalogResponse);
  const first = await fetchModelList();

  resetModelListCache();
  stubFetch(() => {
    throw new TypeError("fetch failed");
  });
  await assert.rejects(fetchModelList(), (err: unknown) => {
    assert.ok(err instanceof HttpError);
    assert.equal(err.status, 502);
    assert.equal(err.code, "MODELS_UNAVAILABLE");
    return true;
  });

  /* Now refill the cache, expire it, and fail the refetch: stale wins. */
  stubFetch(catalogResponse);
  await fetchModelList();
  expireModelListCache();
  stubFetch(() => new Response("upstream down", { status: 503 }));
  const stale = await fetchModelList();
  assert.deepEqual(stale, first);
});

test("rejects a catalog response without a data array", () => {
  assert.throws(() => parseModelList({ models: [] }), /data array/);
});
