import { describe, expect, test } from "vitest";
import { AsyncLimiter, mapWithConcurrency, normalizeConcurrency } from "./async.js";

describe("async concurrency helpers", () => {
  test("preserves input order while limiting active workers", async () => {
    let active = 0;
    let peak = 0;

    const result = await mapWithConcurrency([0, 1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return value * 2;
    });

    expect(result).toEqual([0, 2, 4, 6, 8, 10]);
    expect(peak).toBeLessThanOrEqual(2);
  });

  test("AsyncLimiter never admits more than its limit at once", async () => {
    const limiter = new AsyncLimiter(2);
    let active = 0;
    let peak = 0;
    const task = async () => {
      active += 1;
      peak = Math.max(peak, active);
      // Yield repeatedly so releases and acquisitions interleave on the
      // microtask queue, which is where over-admission would surface.
      for (let i = 0; i < 5; i++) await Promise.resolve();
      active -= 1;
    };
    await Promise.all(Array.from({ length: 50 }, () => limiter.run(task)));
    expect(peak).toBeLessThanOrEqual(2);
    expect(active).toBe(0);
  });

  test("AsyncLimiter frees its slot when a task throws", async () => {
    const limiter = new AsyncLimiter(1);
    await expect(limiter.run(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    // A leaked slot would leave this pending forever rather than resolving.
    await expect(limiter.run(async () => "ok")).resolves.toBe("ok");
  });

  test("normalizes invalid and fractional limits", () => {
    expect(normalizeConcurrency(0)).toBe(1);
    expect(normalizeConcurrency(2.9)).toBe(2);
    expect(normalizeConcurrency(Number.POSITIVE_INFINITY)).toBeGreaterThan(1);
    expect(normalizeConcurrency(100)).toBe(64);
  });
});
