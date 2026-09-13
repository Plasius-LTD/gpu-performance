import { describe, expect, it } from "vitest";
import {
  normalizeWavefrontAdaptiveBudgetPolicy as normalize,
  composeWavefrontAdaptiveImportance as importance,
  quantizeWavefrontAdaptiveSamples as quantize,
} from "../src/index.js";

describe("wavefront adaptive policy", () => {
  it("is fixed by default and ignores inactive adaptive settings", () => {
    expect(normalize(32)).toMatchObject({ enabled: false, minimumSamplesPerPixel: 32, maximumSamplesPerPixel: 32, tiers: [32] });
    expect(normalize(32, { enabled: false, get tiers(): number[] { throw new Error("unused"); } }, 8))
      .toMatchObject({ enabled: false, tiers: [8], sequencePeriodSamplesPerPixel: 32 });
  });
  it("retains default limits and an immutable power-of-two ladder", () => {
    const policy = normalize(32, { enabled: true });
    expect(policy).toMatchObject({ minimumSamplesPerPixel: 2, maximumSamplesPerPixel: 32,
      sequencePeriodSamplesPerPixel: 32, tiers: [2, 4, 8, 16, 32], maximumSoftReduction: 0.75 });
    expect(Object.isFrozen(policy)).toBe(true); expect(Object.isFrozen(policy.tiers)).toBe(true);
  });
  it("keeps sequence strata independent of reduced frame ceilings", () => {
    const policy = normalize(128, { enabled: true, maximumSamplesPerPixel: 100, minimumSamplesPerPixel: 4 }, 2);
    expect(policy).toMatchObject({ minimumSamplesPerPixel: 2, maximumSamplesPerPixel: 2, tiers: [2], sequencePeriodSamplesPerPixel: 100 });
    expect(normalize(32, { enabled: true, minimumSamplesPerPixel: 3, maximumSamplesPerPixel: 13, tiers: [3, 4, 8, 13] }, 2).tiers).toEqual([2]);
  });
  it("bounds every legal ceiling and includes exact endpoints", () => {
    for (let maximum = 1; maximum <= 256; maximum += 1) {
      const policy = normalize(maximum, { enabled: true });
      expect(policy.tiers[0]).toBe(Math.min(2, maximum));
      expect(policy.tiers.at(-1)).toBe(maximum);
      expect(new Set(policy.tiers).size).toBe(policy.tiers.length);
      expect(quantize(policy, -10, 0.5)).toBe(policy.minimumSamplesPerPixel);
      expect(quantize(policy, 500, 0.5)).toBe(maximum);
    }
  });
  it("clamps count options and sorts/deduplicates legal custom interior tiers", () => {
    expect(normalize(32, { enabled: true, minimumSamplesPerPixel: -2, maximumSamplesPerPixel: 1000 })).toMatchObject({ minimumSamplesPerPixel: 1, maximumSamplesPerPixel: 32 });
    expect(normalize(32, { enabled: true, minimumSamplesPerPixel: 3, maximumSamplesPerPixel: 13, tiers: [16, 8, 4, 8, 2] }).tiers).toEqual([3, 4, 8, 13]);
    expect(normalize(8, { enabled: true, minimumSamplesPerPixel: 30, maximumSamplesPerPixel: 0 }).tiers).toEqual([1]);
  });
  it("rejects nonfinite/fractional inputs and malformed tiers or switches", () => {
    for (const n of [0, 257, NaN, Infinity, 1.5]) expect(() => normalize(n)).toThrow();
    for (const n of [NaN, Infinity, 1.5]) expect(() => normalize(32, { enabled: true, minimumSamplesPerPixel: n })).toThrow();
    for (const tiers of [[3], [NaN], [1.5], Array(257).fill(2)]) expect(() => normalize(32, { enabled: true, tiers })).toThrow();
    // @ts-expect-error runtime boundary validation
    expect(() => normalize(32, { enabled: "yes" })).toThrow();
    // @ts-expect-error runtime boundary validation
    expect(() => normalize(32, { enabled: true, firstHitDistance: { enabled: 1 } })).toThrow();
    expect(() => normalize(32, { enabled: true }, 0)).toThrow();
    expect(() => normalize(32, { enabled: true, maximumSoftReduction: NaN })).toThrow();
  });
  it("reports classifier eligibility and conservative environment floors", () => {
    const options = { enabled: true, firstHitDistance: { enabled: true }, environmentOnly: { enabled: true } };
    expect(normalize(4, options)).toMatchObject({ firstHitDistance: { enabled: false, reason: "maximum-spp-below-eight" }, environmentOnly: { enabled: false, minimumSamplesPerPixel: 4, highDynamicRangeFloor: 4 } });
    expect(normalize(32, options)).toMatchObject({ firstHitDistance: { enabled: true, reason: null }, environmentOnly: { enabled: true, minimumSamplesPerPixel: 4, highDynamicRangeFloor: 8 } });
    expect(normalize(32, { enabled: true }).firstHitDistance.reason).toBe("classifier-disabled");
    expect(normalize(32, { enabled: true, minimumSamplesPerPixel: 12, environmentOnly: { enabled: true, minimumSamplesPerPixel: 1, highDynamicRangeFloor: 1 } }).environmentOnly)
      .toMatchObject({ minimumSamplesPerPixel: 12, highDynamicRangeFloor: 12 });
  });
  it("composes only qualified reductions while protective importance wins", () => {
    const policy = normalize(32, { enabled: true, firstHitDistance: { enabled: true }, environmentOnly: { enabled: true } });
    expect(importance(policy, { focusImportance: 0 })).toBe(0.25);
    expect(importance(policy, { focusImportance: 0.5, distance: { valid: false, importance: NaN }, environment: { valid: false, confidence: NaN } })).toBe(0.5);
    expect(importance(policy, { focusImportance: 0, requiredImportance: 1 })).toBe(1);
    expect(importance(policy, { distance: { valid: true, importance: 0.75 } })).toBe(0.75);
    expect(importance(policy, { environment: { valid: true, confidence: 0.4 } })).toBe(0.6);
    expect(importance(policy, { focusImportance: 0.9, distance: { valid: true, importance: 0.9 }, environment: { valid: true, confidence: 0.1 } })).toBeCloseTo(0.7);
    expect(importance(policy, { distance: { valid: true, importance: NaN }, environment: { valid: true, confidence: Infinity } })).toBe(1);
    expect(importance(normalize(4, { enabled: true }), { distance: { valid: true, importance: 0 }, environment: { valid: true, confidence: 1 } })).toBe(1);
    expect(importance(normalize(32), { focusImportance: 0 })).toBe(1);
    expect(() => importance(policy, { focusImportance: NaN })).toThrow();
  });
  it("quantizes between adjacent tiers with unbiased midpoint-stratified expectation", () => {
    const policy = normalize(32, { enabled: true, minimumSamplesPerPixel: 3 });
    for (const target of [3, 3.5, 4, 6, 8, 12, 16, 24, 31.5, 32]) {
      let sum = 0;
      for (let i = 0; i < 4096; i += 1) sum += quantize(policy, target, (i + 0.5) / 4096);
      expect(sum / 4096).toBe(target);
    }
    expect(quantize(policy, 6, 0.499)).toBe(8);
    expect(quantize(policy, 6, 0.5)).toBe(4);
    for (const threshold of [-1, 1, NaN, Infinity]) expect(() => quantize(policy, 6, threshold)).toThrow();
    expect(() => quantize(policy, NaN, 0.5)).toThrow();
    expect(() => quantize({ ...policy, tiers: [3, 4] }, 32, 0.5)).toThrow(/normalize/);
  });
});
