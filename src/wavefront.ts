import { createQualityLadderAdapter } from "./ladder.js";
import type {
  WavefrontPathTracingBudgetAdapter,
  WavefrontPathTracingBudgetAdapterOptions,
  WavefrontPathTracingBudgetConfig,
  WavefrontPathTracingBudgetControlSummary,
  WavefrontPathTracingDenoiseMode,
  WavefrontPathTracingVisibilityProbeMode,
} from "./types.js";
import {
  assertEnumValue,
  readNonNegativeNumber,
  readPositiveNumber,
} from "./validation.js";

export const wavefrontPathTracingDenoiseModes = Object.freeze([
  "off",
  "spatial",
  "spatiotemporal",
]) satisfies readonly WavefrontPathTracingDenoiseMode[];

export const wavefrontPathTracingVisibilityProbeModes = Object.freeze([
  "disabled",
  "mis-balanced",
  "exclusive-emissive",
]) satisfies readonly WavefrontPathTracingVisibilityProbeMode[];

export const wavefrontPathTracingBudgetControlKeys = Object.freeze([
  "maxBounceDepth",
  "samplesPerPixel",
  "activeRayQueueCapacity",
  "explicitLightSamples",
  "visibilityProbeMode",
  "bvhUpdateCadence",
  "denoiseMode",
  "temporalAccumulation",
  "renderScale",
]) satisfies readonly string[];

const wavefrontPathTracingControlSummary = Object.freeze({
  preservesEmissiveEnvironmentBaseline: true,
  degradeOptionalFirst: true,
  degradeFirst: Object.freeze([
    "explicitLightSamples",
    "visibilityProbeMode",
    "denoiseMode",
    "temporalAccumulation",
    "renderScale",
  ]),
  independentControls: wavefrontPathTracingBudgetControlKeys,
}) satisfies WavefrontPathTracingBudgetControlSummary;

function readPositiveInteger(name: string, value: unknown): number {
  const parsed = readPositiveNumber(name, value);
  return Math.max(1, Math.trunc(parsed ?? 1));
}

function readRenderScale(name: string, value: unknown): number {
  const parsed = readPositiveNumber(name, value);
  if ((parsed ?? 1) > 1) {
    throw new Error(`${name} must be less than or equal to 1.`);
  }
  return parsed ?? 1;
}

export function normalizeWavefrontPathTracingBudgetConfig(
  name: string,
  value: unknown
): WavefrontPathTracingBudgetConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${name} must be a plain object.`);
  }

  const source = value as Record<string, unknown>;

  return Object.freeze({
    maxBounceDepth: readPositiveInteger(`${name}.maxBounceDepth`, source.maxBounceDepth),
    samplesPerPixel: readPositiveInteger(`${name}.samplesPerPixel`, source.samplesPerPixel),
    activeRayQueueCapacity: readPositiveInteger(
      `${name}.activeRayQueueCapacity`,
      source.activeRayQueueCapacity
    ),
    explicitLightSamples: Math.max(
      0,
      Math.trunc(
        readNonNegativeNumber(
          `${name}.explicitLightSamples`,
          source.explicitLightSamples
        ) ?? 0
      )
    ),
    visibilityProbeMode: assertEnumValue(
      `${name}.visibilityProbeMode`,
      source.visibilityProbeMode,
      wavefrontPathTracingVisibilityProbeModes
    ),
    bvhUpdateCadence: readPositiveInteger(
      `${name}.bvhUpdateCadence`,
      source.bvhUpdateCadence
    ),
    denoiseMode: assertEnumValue(
      `${name}.denoiseMode`,
      source.denoiseMode,
      wavefrontPathTracingDenoiseModes
    ),
    temporalAccumulation: source.temporalAccumulation === true,
    renderScale: readRenderScale(`${name}.renderScale`, source.renderScale),
    preserveEmissiveEnvironmentBaseline:
      source.preserveEmissiveEnvironmentBaseline !== false,
    degradeOptionalFirst: source.degradeOptionalFirst !== false,
  });
}

export function createWavefrontPathTracingBudgetAdapter(
  options: WavefrontPathTracingBudgetAdapterOptions
): WavefrontPathTracingBudgetAdapter {
  const adapter = createQualityLadderAdapter<WavefrontPathTracingBudgetConfig>({
    ...options,
    domain: options.domain ?? "lighting",
    authority: options.authority ?? "visual",
    importance: options.importance ?? "critical",
    representationBand: options.representationBand ?? "near",
    qualityDimensions: options.qualityDimensions ?? {
      rayTracing: 1,
      lightingSamples: 1,
      updateCadence: 1,
      temporalReuse: 1,
    },
    importanceSignals: options.importanceSignals ?? {
      visible: true,
      playerRelevant: true,
      shadowSignificance: "high",
      reflectionSignificance: "high",
    },
    levels: options.levels.map((level, index) =>
      Object.freeze({
        ...level,
        config: normalizeWavefrontPathTracingBudgetConfig(
          `levels[${index}].config`,
          level.config
        ),
      })
    ),
  });

  return {
    ...adapter,
    getCurrentBudget() {
      return adapter.getCurrentLevel().config;
    },
    getControlSummary() {
      return wavefrontPathTracingControlSummary;
    },
  };
}
