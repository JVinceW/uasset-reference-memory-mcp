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

  test("AsyncLimiter does not admit a newcomer into a slot being handed over", async () => {
    // The regression this guards: releasing used to drop `active` and then wake
    // a waiter, so an `acquire` landing in the microtask between the two saw
    // room and took the slot the waiter was already promised. Both then ran.
    // Reproducing it needs a *fresh* acquire arriving mid-handover — a pool of
    // pre-queued tasks never exercises it — and the newcomer must hold its slot
    // across a tick for the overlap to be observable.
    const limiter = new AsyncLimiter(1);
    let active = 0;
    let peak = 0;
    const track = async (yields: number) => {
      active += 1;
      peak = Math.max(peak, active);
      for (let i = 0; i < yields; i++) await Promise.resolve();
      active -= 1;
    };
    const first = limiter.run(() => track(0));
    const queued = limiter.run(() => track(0));
    const newcomer = Promise.resolve()
      .then(() => {})
      .then(() => limiter.run(() => track(1)));
    await Promise.all([first, queued, newcomer]);
    expect(peak).toBe(1);
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
