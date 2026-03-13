import type {
  DeviceProfile,
  DeviceProfileInput,
  FrameTargetNegotiationOptions,
  FrameTargetProfile,
  RuntimeMode,
} from "./types.js";
import {
  assertEnumValue,
  deviceClasses,
  gpuTiers,
  normalizePlainObject,
  readFrameRateBuckets,
  readPositiveNumber,
  runtimeModes,
  thermalStates,
} from "./validation.js";

const DEFAULT_FRAME_RATE_BUCKETS = Object.freeze([120, 90, 72, 60, 45, 36, 30]);

function uniqueSortedFrameRates(values: readonly number[]): number[] {
  if (values.length === 0) {
    return [];
  }

  return [...new Set(values.map((value) => Math.round(value)))].sort(
    (left, right) => right - left
  );
}

function defaultModeForDevice(deviceClass: DeviceProfileInput["deviceClass"]): RuntimeMode {
  return deviceClass === "xr-headset" ? "immersive-vr" : "flat";
}

/**
 * Normalizes the caller-supplied device profile into a deterministic runtime profile.
 */
export function createDeviceProfile(input: DeviceProfileInput = {}): DeviceProfile {
  const deviceClass =
    input.deviceClass === undefined
      ? "unknown"
      : assertEnumValue("deviceClass", input.deviceClass, deviceClasses);
  const mode =
    input.mode === undefined
      ? defaultModeForDevice(deviceClass)
      : assertEnumValue("mode", input.mode, runtimeModes);
  const defaultRefreshRateHz = mode === "flat" ? 60 : 72;
  const refreshRateHz =
    readPositiveNumber("refreshRateHz", input.refreshRateHz) ?? defaultRefreshRateHz;
  const supportedFrameRates = uniqueSortedFrameRates(
    readFrameRateBuckets("supportedFrameRates", input.supportedFrameRates)
  );
  const metadata = normalizePlainObject("metadata", input.metadata);

  return Object.freeze({
    deviceClass,
    mode,
    refreshRateHz,
    supportedFrameRates: Object.freeze(
      supportedFrameRates.length > 0 ? supportedFrameRates : [refreshRateHz]
    ),
    gpuTier:
      input.gpuTier === undefined
        ? "unknown"
        : assertEnumValue("gpuTier", input.gpuTier, gpuTiers),
    supportsWebGpu: input.supportsWebGpu ?? true,
    supportsFoveation: input.supportsFoveation ?? false,
    thermalState:
      input.thermalState === undefined
        ? "nominal"
        : assertEnumValue("thermalState", input.thermalState, thermalStates),
    metadata,
  });
}

/**
 * Negotiates a device-specific frame target and guardrails for the adaptive governor.
 */
export function negotiateFrameTarget(
  options: FrameTargetNegotiationOptions = {}
): FrameTargetProfile {
  const mode =
    options.mode === undefined
      ? "flat"
      : assertEnumValue("mode", options.mode, runtimeModes);
  const minimumFrameRate = Math.round(
    readPositiveNumber("minimumFrameRate", options.minimumFrameRate) ?? 60
  );
  const maximumFrameRate = readPositiveNumber(
    "maximumFrameRate",
    options.maximumFrameRate
  );
  const deviceRefreshRateHz = readPositiveNumber(
    "deviceRefreshRateHz",
    options.deviceRefreshRateHz
  );
  const supportedFrameRates = uniqueSortedFrameRates(
    readFrameRateBuckets("supportedFrameRates", options.supportedFrameRates)
  );
  const preferredFrameRates = uniqueSortedFrameRates(
    readFrameRateBuckets("preferredFrameRates", options.preferredFrameRates)
  );

  if (maximumFrameRate !== undefined && maximumFrameRate < minimumFrameRate) {
    throw new Error("maximumFrameRate must be greater than or equal to minimumFrameRate.");
  }

  const rationale: string[] = [];

  const candidateFrameRates = uniqueSortedFrameRates([
    ...preferredFrameRates,
    ...supportedFrameRates,
    ...DEFAULT_FRAME_RATE_BUCKETS,
  ]).filter((rate) => {
    if (maximumFrameRate && rate > maximumFrameRate) {
      return false;
    }

    if (deviceRefreshRateHz && rate > deviceRefreshRateHz) {
      return false;
    }

    return true;
  });

  let targetFrameRate =
    candidateFrameRates.find((rate) => rate >= minimumFrameRate) ??
    candidateFrameRates[0] ??
    deviceRefreshRateHz ??
    minimumFrameRate;

  if (
    mode !== "flat" &&
    deviceRefreshRateHz &&
    supportedFrameRates.includes(Math.round(deviceRefreshRateHz))
  ) {
    targetFrameRate = Math.round(deviceRefreshRateHz);
    rationale.push(
      `Using native ${targetFrameRate} Hz immersive session target supported by the device.`
    );
  } else if (targetFrameRate >= minimumFrameRate) {
    rationale.push(
      `Selected ${targetFrameRate} FPS from the negotiated device frame-rate bucket set.`
    );
  } else {
    rationale.push(
      `Device could not meet the requested ${minimumFrameRate} FPS floor, falling back to ${targetFrameRate} FPS.`
    );
  }

  if (mode === "flat") {
    rationale.push("Flat mode keeps a 60 FPS floor by default and negotiates upward.");
  } else {
    rationale.push("Immersive modes prefer headset-native cadence when the session supports it.");
  }

  const targetFrameTimeMs = 1000 / targetFrameRate;
  const downgradeMultiplier = mode === "flat" ? 1.05 : 1.03;
  const upgradeMultiplier = mode === "flat" ? 0.92 : 0.95;

  return Object.freeze({
    mode,
    minimumFrameRate,
    targetFrameRate,
    targetFrameTimeMs,
    downgradeFrameTimeMs: targetFrameTimeMs * downgradeMultiplier,
    upgradeFrameTimeMs: targetFrameTimeMs * upgradeMultiplier,
    candidateFrameRates: Object.freeze(candidateFrameRates),
    rationale: Object.freeze(rationale),
  });
}
