import { test } from "node:test";
import assert from "node:assert/strict";
import { mapWithConcurrency } from "./concurrency.ts";

test("returns results in input order and captures failures individually", async () => {
  const results = await mapWithConcurrency([1, 2, 3, 4], 2, async (n) => {
    if (n === 3) throw new Error("boom");
    return n * 10;
  });
  assert.deepEqual(results, [
    { ok: true, value: 10 },
    { ok: true, value: 20 },
    { ok: false, error: new Error("boom") },
    { ok: true, value: 40 },
  ]);
});

test("never runs more than `limit` calls at once", async () => {
  let inFlight = 0;
  let peak = 0;
  await mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 3, async () => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight--;
  });
  assert.ok(peak <= 3, `peak concurrency was ${peak}`);
  assert.equal(inFlight, 0);
});

test("handles an empty input and a limit larger than the input", async () => {
  assert.deepEqual(await mapWithConcurrency([], 4, async () => 1), []);
  const results = await mapWithConcurrency([1], 8, async (n) => n);
  assert.deepEqual(results, [{ ok: true, value: 1 }]);
});
