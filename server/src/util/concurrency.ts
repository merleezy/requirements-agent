/*
 * Bounded-parallelism map: like Promise.allSettled over fn(items[i]), but
 * with at most `limit` calls in flight. Used by the critic route to fan out
 * one LLM call per requirement without hammering the user's OpenRouter key
 * into a rate limit. Results come back in input order.
 */

export type SettledResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown };

export async function mapWithConcurrency<I, O>(
  items: I[],
  limit: number,
  fn: (item: I) => Promise<O>,
): Promise<SettledResult<O>[]> {
  const results = new Array<SettledResult<O>>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { ok: true, value: await fn(items[index]) };
      } catch (error) {
        results[index] = { ok: false, error };
      }
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}
