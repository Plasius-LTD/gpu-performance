import type {
  DeviceClass,
  GpuTier,
  ModuleAuthority,
  ModuleImportance,
  PerformanceDomain,
  RuntimeMode,
  ThermalState,
  WorkerJobQueueClass,
  WorkerSchedulerMode,
} from "./types.js";

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;

export const runtimeModes = Object.freeze([
  "flat",
  "immersive-vr",
  "immersive-ar",
]) satisfies readonly RuntimeMode[];

export const deviceClasses = Object.freeze([
  "mobile",
  "tablet",
  "desktop",
  "xr-headset",
  "unknown",
]) satisfies readonly DeviceClass[];

export const gpuTiers = Object.freeze([
  "low",
  "mid",
  "high",
  "ultra",
  "unknown",
]) satisfies readonly GpuTier[];

export const thermalStates = Object.freeze([
  "nominal",
  "fair",
  "serious",
  "critical",
]) satisfies readonly ThermalState[];

export const performanceDomains = Object.freeze([
  "resolution",
  "shadows",
  "volumetrics",
  "reflections",
  "post-processing",
  "lighting",
  "particles",
  "cloth",
  "geometry",
  "textures",
  "animation",
  "xr",
  "physics",
  "custom",
]) satisfies readonly PerformanceDomain[];

export const moduleAuthorities = Object.freeze([
  "visual",
  "non-authoritative-simulation",
  "authoritative",
]) satisfies readonly ModuleAuthority[];

export const moduleImportances = Object.freeze([
  "low",
  "medium",
  "high",
  "critical",
]) satisfies readonly ModuleImportance[];

export const workerJobQueueClasses = Object.freeze([
  "render",
  "simulation",
  "lighting",
  "post-processing",
  "voxel",
  "custom",
]) satisfies readonly WorkerJobQueueClass[];

export const workerSchedulerModes = Object.freeze([
  "flat",
  "dag",
]) satisfies readonly WorkerSchedulerMode[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Ensures a value is one of the allowed string literal members.
 */
export function assertEnumValue<T extends string>(
  name: string,
  value: unknown,
  allowedValues: readonly T[]
): T {
  if (typeof value !== "string" || !allowedValues.includes(value as T)) {
    throw new Error(
      `${name} must be one of: ${allowedValues.join(", ")}.`
    );
  }

  return value as T;
}

/**
 * Validates numeric input that must be finite and greater than zero.
 */
export function readPositiveNumber(
  name: string,
  value: unknown
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite number greater than zero.`);
  }

  return value;
}

/**
 * Validates numeric input that must be finite and zero or greater.
 */
export function readNonNegativeNumber(
  name: string,
  value: unknown
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite number greater than or equal to zero.`);
  }

  return value;
}

/**
 * Validates bounded identifier strings used for module and frame ids.
 */
export function assertIdentifier(name: string, value: unknown): string {
  if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value)) {
    throw new Error(
      `${name} must match ${IDENTIFIER_PATTERN.toString()} and be at most 64 characters long.`
    );
  }

  return value;
}

/**
 * Validates that a value is a plain object and returns a shallow-frozen copy.
 */
export function normalizePlainObject(
  name: string,
  value: unknown
): Readonly<Record<string, unknown>> {
  if (value === undefined) {
    return Object.freeze({});
  }

  if (!isRecord(value)) {
    throw new Error(`${name} must be a plain object when provided.`);
  }

  return Object.freeze({ ...value });
}

/**
 * Validates bounded arrays of positive numeric buckets.
 */
export function readFrameRateBuckets(
  name: string,
  value: unknown,
  maxEntries = 16
): number[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array of frame-rate numbers.`);
  }

  if (value.length > maxEntries) {
    throw new Error(`${name} cannot contain more than ${maxEntries} entries.`);
  }

  return value.map((entry, index) => {
    const parsed = readPositiveNumber(`${name}[${index}]`, entry);
    return Math.round(parsed ?? 0);
  });
}

/**
 * Best-effort validation for AbortSignal-like objects without depending on a specific runtime implementation.
 */
export function isAbortSignalLike(value: unknown): value is AbortSignal {
  return (
    typeof value === "object" &&
    value !== null &&
    "aborted" in value &&
    typeof (value as AbortSignal).aborted === "boolean"
  );
}
