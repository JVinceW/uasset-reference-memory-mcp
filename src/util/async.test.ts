import { describe, expect, test } from "vitest";
import { mapWithConcurrency, normalizeConcurrency } from "./async.js";

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

  test("normalizes invalid and fractional limits", () => {
    expect(normalizeConcurrency(0)).toBe(1);
    expect(normalizeConcurrency(2.9)).toBe(2);
    expect(normalizeConcurrency(Number.POSITIVE_INFINITY)).toBeGreaterThan(1);
    expect(normalizeConcurrency(100)).toBe(64);
  });
});
