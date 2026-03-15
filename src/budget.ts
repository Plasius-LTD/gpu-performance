import type {
  MotionClass,
  PerformanceBudgetMetadata,
  PerformanceImportanceSignals,
  PerformanceQualityDimensions,
  QualityDimension,
  RepresentationBand,
} from "./types.js";
import {
  assertEnumValue,
  moduleImportances,
  readNonNegativeNumber,
} from "./validation.js";

export const representationBands = Object.freeze([
  "near",
  "mid",
  "far",
  "horizon",
]) satisfies readonly RepresentationBand[];

export const rayTracingQualityDimensions = Object.freeze([
  "geometry",
  "animation",
  "deformation",
  "shading",
  "shadows",
  "rayTracing",
  "lightingSamples",
  "updateCadence",
  "temporalReuse",
]) satisfies readonly QualityDimension[];

export const motionClasses = Object.freeze([
  "stable",
  "dynamic",
  "volatile",
]) satisfies readonly MotionClass[];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeQualityDimensions(
  name: string,
  value: unknown
): PerformanceQualityDimensions {
  if (value === undefined) {
    return Object.freeze({});
  }

  if (!isPlainObject(value)) {
    throw new Error(`${name} must be a plain object when provided.`);
  }

  const normalized = Object.fromEntries(
    Object.entries(value).flatMap(([key, rawValue]) => {
      const dimension = assertEnumValue(
        `${name}.${key}`,
        key,
        rayTracingQualityDimensions
      );
      const weight = readNonNegativeNumber(`${name}.${key}`, rawValue) ?? 0;
      return weight > 0 ? [[dimension, weight]] : [];
    })
  );

  return Object.freeze(normalized);
}

function normalizeImportanceSignals(
  name: string,
  value: unknown
): Readonly<PerformanceImportanceSignals> {
  if (value === undefined) {
    return Object.freeze({});
  }

  if (!isPlainObject(value)) {
    throw new Error(`${name} must be a plain object when provided.`);
  }

  const normalized: PerformanceImportanceSignals = {};

  if (value.visible !== undefined) {
    if (typeof value.visible !== "boolean") {
      throw new Error(`${name}.visible must be a boolean when provided.`);
    }
    normalized.visible = value.visible;
  }

  if (value.playerRelevant !== undefined) {
    if (typeof value.playerRelevant !== "boolean") {
      throw new Error(`${name}.playerRelevant must be a boolean when provided.`);
    }
    normalized.playerRelevant = value.playerRelevant;
  }

  if (value.imageCritical !== undefined) {
    if (typeof value.imageCritical !== "boolean") {
      throw new Error(`${name}.imageCritical must be a boolean when provided.`);
    }
    normalized.imageCritical = value.imageCritical;
  }

  if (value.motionClass !== undefined) {
    normalized.motionClass = assertEnumValue(
      `${name}.motionClass`,
      value.motionClass,
      motionClasses
    );
  }

  if (value.shadowSignificance !== undefined) {
    normalized.shadowSignificance = assertEnumValue(
      `${name}.shadowSignificance`,
      value.shadowSignificance,
      moduleImportances
    );
  }

  if (value.reflectionSignificance !== undefined) {
    normalized.reflectionSignificance = assertEnumValue(
      `${name}.reflectionSignificance`,
      value.reflectionSignificance,
      moduleImportances
    );
  }

  return Object.freeze(normalized);
}

export function normalizePerformanceBudgetMetadata(
  name: string,
  value: unknown
): Required<Omit<PerformanceBudgetMetadata, "representationBand">> &
  Pick<PerformanceBudgetMetadata, "representationBand"> {
  const source = isPlainObject(value) ? value : {};
  const representationBand =
    source.representationBand === undefined
      ? undefined
      : assertEnumValue(
          `${name}.representationBand`,
          source.representationBand,
          representationBands
        );

  return Object.freeze({
    representationBand,
    qualityDimensions: normalizeQualityDimensions(
      `${name}.qualityDimensions`,
      source.qualityDimensions
    ),
    importanceSignals: normalizeImportanceSignals(
      `${name}.importanceSignals`,
      source.importanceSignals
    ),
  });
}
