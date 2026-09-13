/** Validated policy inputs, independent of renderer resources and transport. */
export interface WavefrontAdaptiveBudgetOptions {
  readonly enabled?: boolean;
  readonly minimumSamplesPerPixel?: number;
  readonly maximumSamplesPerPixel?: number;
  readonly tiers?: readonly number[];
  readonly maximumSoftReduction?: number;
  readonly firstHitDistance?: { readonly enabled?: boolean };
  readonly environmentOnly?: {
    readonly enabled?: boolean;
    readonly minimumSamplesPerPixel?: number;
    readonly highDynamicRangeFloor?: number;
  };
}

/** Eligibility is policy admission, not proof that a classifier ran successfully. */
export interface WavefrontAdaptiveClassifierPolicy {
  readonly enabled: boolean;
  readonly reason: "adaptive-disabled" | "classifier-disabled" | "maximum-spp-below-eight" | null;
}

/** Immutable frame-level policy. The existing governor owns effective ceilings. */
export interface WavefrontAdaptiveBudgetPolicy {
  readonly enabled: boolean;
  readonly minimumSamplesPerPixel: number;
  readonly maximumSamplesPerPixel: number;
  readonly sequencePeriodSamplesPerPixel: number;
  readonly tiers: readonly number[];
  readonly maximumSoftReduction: number;
  readonly firstHitDistance: WavefrontAdaptiveClassifierPolicy;
  readonly environmentOnly: WavefrontAdaptiveClassifierPolicy & {
    readonly minimumSamplesPerPixel: number;
    readonly highDynamicRangeFloor: number;
  };
}

/** Renderer-owned conservative evidence; invalid depth/coverage cannot reduce SPP. */
export interface WavefrontAdaptiveImportanceEvidence {
  readonly focusImportance?: number;
  readonly requiredImportance?: number;
  readonly distance?: { readonly valid: boolean; readonly importance: number };
  readonly environment?: { readonly valid: boolean; readonly confidence: number };
}

function integer(name: string, value: number): number {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a finite integer.`);
  return value;
}

function ceiling(name: string, value: number): number {
  integer(name, value);
  if (value < 1 || value > 256) throw new RangeError(`${name} must be in 1..256.`);
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function unit(name: string, value: number): number {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite.`);
  return clamp(value, 0, 1);
}

function enabled(name: string, value: boolean | undefined): boolean {
  if (value !== undefined && typeof value !== "boolean") throw new TypeError(`${name} must be boolean.`);
  return value === true;
}

function classifier(active: boolean, requested: boolean, maximum: number): WavefrontAdaptiveClassifierPolicy {
  const reason = !active ? "adaptive-disabled" : !requested ? "classifier-disabled"
    : maximum < 8 ? "maximum-spp-below-eight" : null;
  return Object.freeze({ enabled: reason === null, reason });
}

/** Normalize once per frame, before contributing samples are drawn. */
export function normalizeWavefrontAdaptiveBudgetPolicy(
  samplesPerPixel: number,
  options: WavefrontAdaptiveBudgetOptions = {},
  effectiveSamplesPerPixel: number = samplesPerPixel,
): WavefrontAdaptiveBudgetPolicy {
  ceiling("samplesPerPixel", samplesPerPixel);
  ceiling("effectiveSamplesPerPixel", effectiveSamplesPerPixel);
  const active = enabled("enabled", options.enabled);
  const configuredMaximum = active ? clamp(integer("maximumSamplesPerPixel",
    options.maximumSamplesPerPixel ?? samplesPerPixel), 1, samplesPerPixel) : samplesPerPixel;
  const maximum = Math.min(configuredMaximum, effectiveSamplesPerPixel);
  const configuredMinimum = active ? clamp(integer("minimumSamplesPerPixel",
    options.minimumSamplesPerPixel ?? Math.min(2, samplesPerPixel)), 1, configuredMaximum) : configuredMaximum;
  const minimum = Math.min(configuredMinimum, maximum);
  let tiers: number[] = [minimum, maximum];
  if (active) {
    if (options.tiers === undefined) {
      for (let tier = 1; tier <= 256; tier *= 2) if (tier >= minimum && tier <= maximum) tiers.push(tier);
    } else {
      if (!Array.isArray(options.tiers) || options.tiers.length > 256) throw new RangeError("tiers must be an array of at most 256 entries.");
      for (const tier of options.tiers) {
        ceiling("tier", tier);
        if ((tier & (tier - 1)) !== 0 && tier !== configuredMinimum && tier !== configuredMaximum) {
          throw new RangeError("Interior tiers must be powers of two.");
        }
        if (tier >= minimum && tier <= maximum) tiers.push(tier);
      }
    }
  }
  tiers = [...new Set(tiers)].sort((a, b) => a - b);
  const distance = classifier(active, active && enabled("firstHitDistance.enabled", options.firstHitDistance?.enabled), maximum);
  const environment = classifier(active, active && enabled("environmentOnly.enabled", options.environmentOnly?.enabled), maximum);
  const environmentMinimum = active ? clamp(integer("environmentOnly.minimumSamplesPerPixel",
    options.environmentOnly?.minimumSamplesPerPixel ?? Math.max(minimum, 4)), minimum, maximum) : maximum;
  const highDynamicRangeFloor = active ? clamp(integer("environmentOnly.highDynamicRangeFloor",
    options.environmentOnly?.highDynamicRangeFloor ?? Math.max(minimum, 8)), environmentMinimum, maximum) : maximum;
  return Object.freeze({ enabled: active, minimumSamplesPerPixel: minimum, maximumSamplesPerPixel: maximum,
    sequencePeriodSamplesPerPixel: configuredMaximum, tiers: Object.freeze(tiers),
    maximumSoftReduction: active ? unit("maximumSoftReduction", options.maximumSoftReduction ?? 0.75) : 0,
    firstHitDistance: distance,
    environmentOnly: Object.freeze({ ...environment, minimumSamplesPerPixel: environmentMinimum, highDynamicRangeFloor }),
  });
}

/** CPU policy reference; GPU scheduling must preserve the same conservative rule. */
export function composeWavefrontAdaptiveImportance(
  policy: WavefrontAdaptiveBudgetPolicy,
  evidence: WavefrontAdaptiveImportanceEvidence = {},
): number {
  if (!policy.enabled) return 1;
  let reduction = 1 - unit("focusImportance", evidence.focusImportance ?? 1);
  if (policy.firstHitDistance.enabled && evidence.distance?.valid === true && Number.isFinite(evidence.distance.importance)) {
    reduction += 1 - unit("distanceImportance", evidence.distance.importance);
  }
  if (policy.environmentOnly.enabled && evidence.environment?.valid === true && Number.isFinite(evidence.environment.confidence)) {
    reduction += unit("environmentConfidence", evidence.environment.confidence);
  }
  return Math.max(1 - Math.min(policy.maximumSoftReduction, reduction),
    unit("requiredImportance", evidence.requiredImportance ?? 0));
}

/**
 * Select an adjacent tier using an independent, spatially scrambled threshold.
 * The renderer must enforce material/environment floors before calling this
 * reference rule; selected budgets must never define the sampling sequence period.
 */
export function quantizeWavefrontAdaptiveSamples(
  policy: WavefrontAdaptiveBudgetPolicy,
  continuousSamplesPerPixel: number,
  threshold: number,
): number {
  if (!Number.isFinite(continuousSamplesPerPixel)) throw new RangeError("continuousSamplesPerPixel must be finite.");
  if (!Number.isFinite(threshold) || threshold < 0 || threshold >= 1) throw new RangeError("threshold must be in [0,1).");
  const target = clamp(continuousSamplesPerPixel, policy.minimumSamplesPerPixel, policy.maximumSamplesPerPixel);
  let lower = policy.minimumSamplesPerPixel;
  for (const upper of policy.tiers) {
    if (target === upper) return upper;
    if (target < upper) return threshold < (target - lower) / (upper - lower) ? upper : lower;
    lower = upper;
  }
  throw new RangeError("Policy tiers do not cover their declared maximum; normalize the policy first.");
}
