import { createDeviceProfile, negotiateFrameTarget } from "./device.js";
import type {
  FrameSample,
  GovernorAdaptationOptions,
  GovernorDecision,
  GovernorErrorRecord,
  GovernorMetrics,
  GovernorState,
  GovernorWorkerGraphSummary,
  GpuPerformanceGovernorOptions,
  PerformanceAdjustmentContext,
  PerformanceAdjustmentRecord,
  PerformanceDomain,
  PerformanceGovernor,
  PerformanceModuleAdapter,
  PerformanceModuleSnapshot,
  PressureLevel,
  ThermalState,
} from "./types.js";
import {
  assertIdentifier,
  isAbortSignalLike,
  performanceDomains,
  readNonNegativeNumber,
  readPositiveNumber,
  thermalStates,
} from "./validation.js";

const MAX_MODULE_COUNT = 128;
const MAX_SAMPLE_WINDOW_SIZE = 240;

export const defaultDomainOrder = Object.freeze<readonly PerformanceDomain[]>([
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
]);

const DEFAULT_ADAPTATION_OPTIONS = Object.freeze<Required<GovernorAdaptationOptions>>({
  sampleWindowSize: 24,
  minimumSamplesBeforeAdjustment: 8,
  degradeCooldownFrames: 6,
  upgradeCooldownFrames: 24,
  minStableFramesForRecovery: 10,
  trendSensitivityMs: 0.35,
  emaAlpha: 0.25,
  maxStepChangesPerCycle: 2,
  allowAuthoritativeScaling: false,
  domainOrder: defaultDomainOrder,
  maxRetainedErrors: 50,
  maxRetainedFrameIds: 512,
});

function clampPositiveInteger(
  value: number | undefined,
  fallback: number,
  maximum?: number
): number {
  if (!value || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  const rounded = Math.round(value);
  return maximum ? Math.min(rounded, maximum) : rounded;
}

function clampRatio(value: number | undefined, fallback: number): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value >= 1
  ) {
    return fallback;
  }

  return value;
}

function buildAdaptationOptions(
  options: GovernorAdaptationOptions | undefined
): Required<GovernorAdaptationOptions> {
  const domainOrder =
    options?.domainOrder?.length && options.domainOrder.length <= performanceDomains.length
      ? [...new Set(options.domainOrder)]
      : DEFAULT_ADAPTATION_OPTIONS.domainOrder;

  return {
    sampleWindowSize: clampPositiveInteger(
      options?.sampleWindowSize,
      DEFAULT_ADAPTATION_OPTIONS.sampleWindowSize,
      MAX_SAMPLE_WINDOW_SIZE
    ),
    minimumSamplesBeforeAdjustment: clampPositiveInteger(
      options?.minimumSamplesBeforeAdjustment,
      DEFAULT_ADAPTATION_OPTIONS.minimumSamplesBeforeAdjustment
    ),
    degradeCooldownFrames: clampPositiveInteger(
      options?.degradeCooldownFrames,
      DEFAULT_ADAPTATION_OPTIONS.degradeCooldownFrames
    ),
    upgradeCooldownFrames: clampPositiveInteger(
      options?.upgradeCooldownFrames,
      DEFAULT_ADAPTATION_OPTIONS.upgradeCooldownFrames
    ),
    minStableFramesForRecovery: clampPositiveInteger(
      options?.minStableFramesForRecovery,
      DEFAULT_ADAPTATION_OPTIONS.minStableFramesForRecovery
    ),
    trendSensitivityMs:
      typeof options?.trendSensitivityMs === "number" &&
      Number.isFinite(options.trendSensitivityMs) &&
      options.trendSensitivityMs > 0
        ? options.trendSensitivityMs
        : DEFAULT_ADAPTATION_OPTIONS.trendSensitivityMs,
    emaAlpha: clampRatio(options?.emaAlpha, DEFAULT_ADAPTATION_OPTIONS.emaAlpha),
    maxStepChangesPerCycle: clampPositiveInteger(
      options?.maxStepChangesPerCycle,
      DEFAULT_ADAPTATION_OPTIONS.maxStepChangesPerCycle
    ),
    allowAuthoritativeScaling:
      options?.allowAuthoritativeScaling ??
      DEFAULT_ADAPTATION_OPTIONS.allowAuthoritativeScaling,
    domainOrder,
    maxRetainedErrors: clampPositiveInteger(
      options?.maxRetainedErrors,
      DEFAULT_ADAPTATION_OPTIONS.maxRetainedErrors
    ),
    maxRetainedFrameIds: clampPositiveInteger(
      options?.maxRetainedFrameIds,
      DEFAULT_ADAPTATION_OPTIONS.maxRetainedFrameIds
    ),
  };
}

function averageOf(values: readonly number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function percentile(values: readonly number[], ratio: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * ratio) - 1)
  );

  return sorted[index] ?? 0;
}

function averageFrameMetric(
  samples: readonly FrameSample[],
  key: "cpuTimeMs" | "gpuTimeMs"
) {
  const values = samples
    .map((sample) => sample[key])
    .filter((value): value is number => typeof value === "number");

  return averageOf(values);
}

function computeTrendDelta(samples: readonly FrameSample[]): number {
  if (samples.length < 4) {
    return 0;
  }

  const midpoint = Math.floor(samples.length / 2);
  const older = samples.slice(0, midpoint).map((sample) => sample.frameTimeMs);
  const newer = samples.slice(midpoint).map((sample) => sample.frameTimeMs);
  const olderAverage = averageOf(older) ?? 0;
  const newerAverage = averageOf(newer) ?? 0;
  return newerAverage - olderAverage;
}

function createMetrics(
  samples: readonly FrameSample[],
  emaFrameTimeMs: number,
  targetFrameTimeMs: number,
  thermalState: ThermalState
): GovernorMetrics {
  const frameTimes = samples.map((sample) => sample.frameTimeMs);
  const latestFrameTimeMs = frameTimes[frameTimes.length - 1] ?? targetFrameTimeMs;
  const averageFrameTimeMs = averageOf(frameTimes) ?? targetFrameTimeMs;
  const fps = averageFrameTimeMs > 0 ? 1000 / averageFrameTimeMs : 0;
  const p95FrameTimeMs = percentile(frameTimes, 0.95);
  const dropRatio =
    samples.filter(
      (sample) =>
        sample.dropped === true || sample.frameTimeMs > targetFrameTimeMs * 1.1
    ).length / Math.max(1, samples.length);

  return {
    sampleCount: samples.length,
    fps,
    latestFrameTimeMs,
    averageFrameTimeMs,
    emaFrameTimeMs,
    p95FrameTimeMs,
    averageCpuTimeMs: averageFrameMetric(samples, "cpuTimeMs"),
    averageGpuTimeMs: averageFrameMetric(samples, "gpuTimeMs"),
    targetFrameTimeMs,
    frameTimeDeltaMs: averageFrameTimeMs - targetFrameTimeMs,
    trendDeltaMs: computeTrendDelta(samples),
    dropRatio,
    thermalState,
  };
}

function classifyPressure(
  metrics: GovernorMetrics,
  downgradeFrameTimeMs: number,
  upgradeFrameTimeMs: number,
  trendSensitivityMs: number
): PressureLevel {
  if (
    metrics.thermalState === "critical" ||
    metrics.averageFrameTimeMs >= metrics.targetFrameTimeMs * 1.25 ||
    metrics.latestFrameTimeMs >= metrics.targetFrameTimeMs * 1.5 ||
    metrics.dropRatio >= 0.35
  ) {
    return "starved";
  }

  if (
    metrics.thermalState === "serious" ||
    metrics.averageFrameTimeMs >= metrics.targetFrameTimeMs * 1.12 ||
    metrics.p95FrameTimeMs >= metrics.targetFrameTimeMs * 1.25 ||
    metrics.trendDeltaMs >= trendSensitivityMs * 1.5
  ) {
    return "critical";
  }

  if (
    metrics.thermalState === "fair" ||
    metrics.averageFrameTimeMs >= downgradeFrameTimeMs ||
    metrics.trendDeltaMs >= trendSensitivityMs ||
    metrics.dropRatio >= 0.1
  ) {
    return "elevated";
  }

  if (
    metrics.averageFrameTimeMs <= upgradeFrameTimeMs &&
    metrics.trendDeltaMs <= 0 &&
    metrics.dropRatio <= 0.05
  ) {
    return "recovering";
  }

  return "stable";
}

function domainRank(
  domain: PerformanceDomain,
  domainOrder: readonly PerformanceDomain[]
): number {
  const index = domainOrder.indexOf(domain);
  return index >= 0 ? index : domainOrder.length + 1;
}

type WorkerDagSnapshot = PerformanceModuleSnapshot & {
  priority: number;
  dependencies: readonly string[];
  dependents: readonly string[];
  dependencyCount: number;
  unresolvedDependencyCount: number;
  dependentCount: number;
  root: boolean;
  schedulerMode: "flat" | "dag";
};

function toWorkerDagSnapshot(
  snapshot: PerformanceModuleSnapshot
): WorkerDagSnapshot | null {
  if (
    typeof (snapshot as { priority?: unknown }).priority !== "number" ||
    !Array.isArray((snapshot as { dependencies?: unknown }).dependencies) ||
    !Array.isArray((snapshot as { dependents?: unknown }).dependents) ||
    typeof (snapshot as { dependencyCount?: unknown }).dependencyCount !== "number" ||
    typeof (snapshot as { unresolvedDependencyCount?: unknown }).unresolvedDependencyCount !==
      "number" ||
    typeof (snapshot as { dependentCount?: unknown }).dependentCount !== "number" ||
    typeof (snapshot as { root?: unknown }).root !== "boolean" ||
    ((snapshot as { schedulerMode?: unknown }).schedulerMode !== "flat" &&
      (snapshot as { schedulerMode?: unknown }).schedulerMode !== "dag")
  ) {
    return null;
  }

  return snapshot as WorkerDagSnapshot;
}

const representationBandProtectionScores = Object.freeze({
  near: 140,
  mid: 80,
  far: 20,
  horizon: 0,
});

const motionProtectionScores = Object.freeze({
  stable: 0,
  dynamic: 12,
  volatile: 24,
});

const dimensionBiasScores = Object.freeze({
  geometry: 22,
  animation: 16,
  deformation: 20,
  shading: 10,
  shadows: 8,
  rayTracing: 4,
  lightingSamples: -8,
  updateCadence: -24,
  temporalReuse: -20,
});

function importanceWeight(value: string | undefined): number {
  return value === "critical"
    ? 20
    : value === "high"
      ? 12
      : value === "medium"
        ? 6
        : 0;
}

function rankBudgetMetadata(snapshot: PerformanceModuleSnapshot): number {
  const representationBand =
    snapshot.representationBand &&
    snapshot.representationBand in representationBandProtectionScores
      ? snapshot.representationBand
      : undefined;
  const qualityDimensions =
    snapshot.qualityDimensions && typeof snapshot.qualityDimensions === "object"
      ? snapshot.qualityDimensions
      : {};
  const importanceSignals =
    snapshot.importanceSignals && typeof snapshot.importanceSignals === "object"
      ? snapshot.importanceSignals
      : {};

  const bandScore = representationBand
    ? representationBandProtectionScores[representationBand]
    : 0;
  const visibilityScore =
    (importanceSignals.visible ? 26 : 0) +
    (importanceSignals.playerRelevant ? 24 : 0) +
    (importanceSignals.imageCritical ? 18 : 0);
  const motionScore =
    importanceSignals.motionClass &&
    importanceSignals.motionClass in motionProtectionScores
      ? motionProtectionScores[importanceSignals.motionClass]
      : 0;
  const significanceScore =
    importanceWeight(importanceSignals.shadowSignificance) +
    importanceWeight(importanceSignals.reflectionSignificance);
  const dimensionScore = Object.entries(qualityDimensions).reduce(
    (total, [dimension, weight]) =>
      total +
      ((dimensionBiasScores as Record<string, number>)[dimension] ?? 0) *
        (typeof weight === "number" ? weight : 0),
    0
  );

  return bandScore + visibilityScore + motionScore + significanceScore + dimensionScore;
}

function buildWorkerGraphSummary(
  snapshots: readonly PerformanceModuleSnapshot[]
): GovernorWorkerGraphSummary | null {
  const dagSnapshots = snapshots
    .map((snapshot) => toWorkerDagSnapshot(snapshot))
    .filter((snapshot): snapshot is WorkerDagSnapshot => snapshot?.schedulerMode === "dag");

  if (dagSnapshots.length === 0) {
    return null;
  }

  const lanes = new Map<number, { priority: number; jobCount: number; rootCount: number; protectedJobCount: number }>();
  const roots: string[] = [];
  let protectedJobCount = 0;
  let maxPriority = 0;
  let maxDependentCount = 0;

  for (const snapshot of dagSnapshots) {
    if (snapshot.root) {
      roots.push(snapshot.id);
    }

    const isProtected =
      snapshot.authority === "authoritative" ||
      snapshot.root ||
      snapshot.priority > 0 ||
      snapshot.dependentCount > 0;
    if (isProtected) {
      protectedJobCount += 1;
    }

    maxPriority = Math.max(maxPriority, snapshot.priority);
    maxDependentCount = Math.max(maxDependentCount, snapshot.dependentCount);

    const lane = lanes.get(snapshot.priority) ?? {
      priority: snapshot.priority,
      jobCount: 0,
      rootCount: 0,
      protectedJobCount: 0,
    };
    lane.jobCount += 1;
    if (snapshot.root) {
      lane.rootCount += 1;
    }
    if (isProtected) {
      lane.protectedJobCount += 1;
    }
    lanes.set(snapshot.priority, lane);
  }

  return Object.freeze({
    schedulerMode: "dag",
    jobCount: dagSnapshots.length,
    rootCount: roots.length,
    protectedJobCount,
    degradableJobCount: dagSnapshots.length - protectedJobCount,
    maxPriority,
    maxDependentCount,
    roots: Object.freeze([...roots]),
    priorityLanes: Object.freeze(
      [...lanes.values()]
        .sort((left, right) => right.priority - left.priority)
        .map((lane) =>
          Object.freeze({
            priority: lane.priority,
            jobCount: lane.jobCount,
            rootCount: lane.rootCount,
            protectedJobCount: lane.protectedJobCount,
          })
        )
    ),
  });
}

function rankForDegrade(
  snapshot: PerformanceModuleSnapshot,
  domainOrder: readonly PerformanceDomain[],
  allowAuthoritativeScaling: boolean
): number {
  if (snapshot.authority === "authoritative" && !allowAuthoritativeScaling) {
    return Number.POSITIVE_INFINITY;
  }

  const authorityScore =
    snapshot.authority === "visual"
      ? 0
      : snapshot.authority === "non-authoritative-simulation"
        ? 100
        : 300;
  const importanceScore =
    snapshot.importance === "low"
      ? 0
      : snapshot.importance === "medium"
        ? 20
        : snapshot.importance === "high"
          ? 40
          : 60;
  const costScore = -(snapshot.estimatedCostMs ?? 0);
  const workerDag = toWorkerDagSnapshot(snapshot);
  const dagProtectionScore =
    workerDag?.schedulerMode === "dag"
      ? (workerDag.root ? 120 : 0) +
        workerDag.priority * 25 +
        workerDag.dependentCount * 18
      : 0;
  const budgetMetadataScore = rankBudgetMetadata(snapshot);

  return (
    authorityScore +
    importanceScore +
    domainRank(snapshot.domain, domainOrder) * 10 +
    costScore +
    dagProtectionScore +
    budgetMetadataScore
  );
}

function buildReason(
  pressureLevel: PressureLevel,
  metrics: GovernorMetrics,
  workerGraph: GovernorWorkerGraphSummary | null
): string {
  const average = metrics.averageFrameTimeMs.toFixed(2);
  const target = metrics.targetFrameTimeMs.toFixed(2);
  const trend = metrics.trendDeltaMs.toFixed(2);
  const graphNote =
    workerGraph && workerGraph.schedulerMode === "dag"
      ? ` DAG roots ${workerGraph.rootCount}/${workerGraph.jobCount}, max priority ${workerGraph.maxPriority}, max fan-out ${workerGraph.maxDependentCount}.`
      : "";
  return `${pressureLevel} pressure: avg ${average} ms vs target ${target} ms, trend delta ${trend} ms.${graphNote}`;
}

function sanitizeErrorMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unexpected runtime failure.";

  return message.replace(/\s+/gu, " ").trim().slice(0, 160) || "Unexpected runtime failure.";
}

function validateTelemetryHooks(
  telemetry: GpuPerformanceGovernorOptions["telemetry"]
): void {
  if (!telemetry) {
    return;
  }

  for (const [name, hook] of Object.entries(telemetry)) {
    if (hook !== undefined && typeof hook !== "function") {
      throw new Error(`telemetry.${name} must be a function when provided.`);
    }
  }
}

function validateFrameSample(sample: FrameSample): void {
  readPositiveNumber("frameTimeMs", sample.frameTimeMs);
  readNonNegativeNumber("cpuTimeMs", sample.cpuTimeMs);
  readNonNegativeNumber("gpuTimeMs", sample.gpuTimeMs);
  readNonNegativeNumber("timestampMs", sample.timestampMs);

  if (sample.dropped !== undefined && typeof sample.dropped !== "boolean") {
    throw new Error("dropped must be a boolean when provided.");
  }

  if (sample.thermalState !== undefined && !thermalStates.includes(sample.thermalState)) {
    throw new Error(`thermalState must be one of: ${thermalStates.join(", ")}.`);
  }

  if (sample.frameId !== undefined) {
    assertIdentifier("frameId", sample.frameId);
  }

  if (sample.signal !== undefined && !isAbortSignalLike(sample.signal)) {
    throw new Error("signal must be an AbortSignal-like object when provided.");
  }
}

function validateModuleAdapter(module: PerformanceModuleAdapter): void {
  if (!module || typeof module !== "object") {
    throw new Error("modules entries must be objects that implement the adapter contract.");
  }

  assertIdentifier("module.id", module.id);

  if (typeof module.getSnapshot !== "function") {
    throw new Error(`Module "${module.id}" must implement getSnapshot().`);
  }

  if (typeof module.stepDown !== "function" || typeof module.stepUp !== "function") {
    throw new Error(`Module "${module.id}" must implement stepDown() and stepUp().`);
  }
}

function createErrorRecord(input: {
  cycle: number;
  source: GovernorErrorRecord["source"];
  code: string;
  message: string;
  retryable: boolean;
  moduleId?: string;
  correlationId?: string;
}): GovernorErrorRecord {
  return Object.freeze({
    cycle: input.cycle,
    source: input.source,
    code: input.code,
    message: input.message,
    retryable: input.retryable,
    moduleId: input.moduleId,
    correlationId: input.correlationId,
  });
}

/**
 * Creates the local closed-loop GPU performance governor.
 */
export function createGpuPerformanceGovernor(
  options: GpuPerformanceGovernorOptions
): PerformanceGovernor {
  if (!options || typeof options !== "object") {
    throw new Error("createGpuPerformanceGovernor requires an options object.");
  }

  validateTelemetryHooks(options.telemetry);

  const device = createDeviceProfile(options.device);
  if (!device.supportsWebGpu) {
    throw new Error(
      "WebGPU support is required to create the GPU performance governor."
    );
  }

  const adaptation = buildAdaptationOptions(options.adaptation);
  const target = negotiateFrameTarget({
    mode: options.target?.mode ?? device.mode,
    deviceRefreshRateHz: options.target?.deviceRefreshRateHz ?? device.refreshRateHz,
    supportedFrameRates:
      options.target?.supportedFrameRates ?? device.supportedFrameRates,
    preferredFrameRates: options.target?.preferredFrameRates,
    minimumFrameRate: options.target?.minimumFrameRate,
    maximumFrameRate: options.target?.maximumFrameRate,
  });

  const modules = new Map<string, PerformanceModuleAdapter>();
  if ((options.modules?.length ?? 0) > MAX_MODULE_COUNT) {
    throw new Error(`modules cannot contain more than ${MAX_MODULE_COUNT} adapters.`);
  }

  for (const module of options.modules ?? []) {
    validateModuleAdapter(module);
    if (modules.has(module.id)) {
      throw new Error(`Duplicate module id "${module.id}" detected.`);
    }
    modules.set(module.id, module);
  }

  let cycle = 0;
  let samples: FrameSample[] = [];
  let emaFrameTimeMs = target.targetFrameTimeMs;
  let lastThermalState = device.thermalState;
  let lastDecision: GovernorDecision | null = null;
  let stableRecoveryFrames = 0;
  let lastDownCycle = Number.NEGATIVE_INFINITY;
  let lastUpCycle = Number.NEGATIVE_INFINITY;
  let recoveryStack: string[] = [];
  let recentErrors: GovernorErrorRecord[] = [];
  let recentFrameIds = new Set<string>();
  let recentFrameIdQueue: string[] = [];

  const appendError = (error: GovernorErrorRecord, decisionErrors?: GovernorErrorRecord[]) => {
    if (decisionErrors) {
      decisionErrors.push(error);
    }

    recentErrors = [...recentErrors, error].slice(-adaptation.maxRetainedErrors);

    if (typeof options.telemetry?.onError === "function") {
      try {
        options.telemetry.onError(error);
      } catch {
        // Error reporting must never cause recursive runtime failure.
      }
    }
  };

  const emitTelemetry = <Payload>(
    hook: ((payload: Payload) => void) | undefined,
    payload: Payload,
    errorFactory: () => GovernorErrorRecord,
    decisionErrors?: GovernorErrorRecord[]
  ) => {
    if (typeof hook !== "function") {
      return;
    }

    try {
      hook(payload);
    } catch {
      appendError(errorFactory(), decisionErrors);
    }
  };

  emitTelemetry(
    options.telemetry?.onTargetNegotiated,
    target,
    () =>
      createErrorRecord({
        cycle,
        source: "telemetry",
        code: "TELEMETRY_TARGET_HOOK_FAILED",
        message: "Target-negotiated telemetry callback failed.",
        retryable: true,
      })
  );

  const getModuleSnapshots = (): PerformanceModuleSnapshot[] =>
    [...modules.values()]
      .map((module) => {
        try {
          return module.getSnapshot();
        } catch {
          return null;
        }
      })
      .filter((snapshot): snapshot is PerformanceModuleSnapshot => snapshot !== null);

  const createContext = (
    cause: "degrade" | "recover",
    pressureLevel: PressureLevel,
    metrics: GovernorMetrics,
    workerGraph: GovernorWorkerGraphSummary | null
  ): PerformanceAdjustmentContext => ({
    cycle,
    cause,
    pressureLevel,
    metrics,
    target,
    workerGraph,
  });

  const classifyCurrentPressure = (metrics: GovernorMetrics) =>
    classifyPressure(
      metrics,
      target.downgradeFrameTimeMs,
      target.upgradeFrameTimeMs,
      adaptation.trendSensitivityMs
    );

  const buildDecision = (
    processed: boolean,
    pressureLevel: PressureLevel,
    metrics: GovernorMetrics,
    workerGraph: GovernorWorkerGraphSummary | null,
    adjustments: readonly PerformanceAdjustmentRecord[],
    errors: readonly GovernorErrorRecord[],
    reason: string
  ): GovernorDecision => ({
    cycle,
    processed,
    pressureLevel,
    metrics,
    workerGraph,
    adjustments,
    errors,
    reason,
  });

  const buildIgnoredDecision = (
    reason: string,
    errors: readonly GovernorErrorRecord[] = []
  ): GovernorDecision => {
    const metrics =
      lastDecision?.metrics ??
      createMetrics(samples, emaFrameTimeMs, target.targetFrameTimeMs, lastThermalState);
    const pressureLevel = lastDecision?.pressureLevel ?? classifyCurrentPressure(metrics);
    const workerGraph =
      lastDecision?.workerGraph ?? buildWorkerGraphSummary(getModuleSnapshots());

    return buildDecision(
      false,
      pressureLevel,
      metrics,
      workerGraph,
      [],
      errors,
      reason
    );
  };

  const rememberFrameId = (frameId: string): boolean => {
    if (recentFrameIds.has(frameId)) {
      return false;
    }

    recentFrameIds.add(frameId);
    recentFrameIdQueue.push(frameId);

    while (recentFrameIdQueue.length > adaptation.maxRetainedFrameIds) {
      const oldest = recentFrameIdQueue.shift();
      if (oldest) {
        recentFrameIds.delete(oldest);
      }
    }

    return true;
  };

  const selectDegradeCandidates = (
    decisionErrors: GovernorErrorRecord[],
    correlationId?: string
  ): PerformanceModuleAdapter[] =>
    [...modules.values()]
      .map((module) => {
        try {
          return {
            module,
            snapshot: module.getSnapshot(),
          };
        } catch {
          appendError(
            createErrorRecord({
              cycle,
              source: "module",
              code: "MODULE_SNAPSHOT_FAILED",
              message: `Module "${module.id}" snapshot failed and the module was skipped.`,
              retryable: true,
              moduleId: module.id,
              correlationId,
            }),
            decisionErrors
          );
          return null;
        }
      })
      .filter(
        (
          candidate
        ): candidate is {
          module: PerformanceModuleAdapter;
          snapshot: PerformanceModuleSnapshot;
        } => candidate !== null
      )
      .sort((left, right) => {
        const leftRank = rankForDegrade(
          left.snapshot,
          adaptation.domainOrder,
          adaptation.allowAuthoritativeScaling
        );
        const rightRank = rankForDegrade(
          right.snapshot,
          adaptation.domainOrder,
          adaptation.allowAuthoritativeScaling
        );

        return leftRank - rightRank;
      })
      .map((candidate) => candidate.module);

  const attemptDowngrade = (
    pressureLevel: PressureLevel,
    metrics: GovernorMetrics,
    workerGraph: GovernorWorkerGraphSummary | null,
    decisionErrors: GovernorErrorRecord[],
    correlationId?: string
  ): PerformanceAdjustmentRecord[] => {
    const changesAllowed =
      pressureLevel === "starved"
        ? adaptation.maxStepChangesPerCycle
        : Math.min(
            adaptation.maxStepChangesPerCycle,
            pressureLevel === "critical" ? 2 : 1
          );
    const context = createContext("degrade", pressureLevel, metrics, workerGraph);
    const adjustments: PerformanceAdjustmentRecord[] = [];

    for (const module of selectDegradeCandidates(decisionErrors, correlationId)) {
      if (adjustments.length >= changesAllowed) {
        break;
      }

      try {
        const adjustment = module.stepDown(context);
        if (!adjustment) {
          continue;
        }

        adjustments.push(adjustment);
        recoveryStack.push(module.id);
      } catch {
        appendError(
          createErrorRecord({
            cycle,
            source: "module",
            code: "MODULE_STEP_DOWN_FAILED",
            message: `Module "${module.id}" could not be reduced during degrade handling.`,
            retryable: true,
            moduleId: module.id,
            correlationId,
          }),
          decisionErrors
        );
      }
    }

    return adjustments;
  };

  const attemptRecovery = (
    metrics: GovernorMetrics,
    workerGraph: GovernorWorkerGraphSummary | null,
    decisionErrors: GovernorErrorRecord[],
    correlationId?: string
  ): PerformanceAdjustmentRecord[] => {
    const context = createContext("recover", "recovering", metrics, workerGraph);

    while (recoveryStack.length > 0) {
      const moduleId = recoveryStack[recoveryStack.length - 1];
      if (!moduleId) {
        recoveryStack.pop();
        continue;
      }

      const module = modules.get(moduleId);
      if (!module) {
        recoveryStack.pop();
        continue;
      }

      try {
        const adjustment = module.stepUp(context);
        recoveryStack.pop();

        if (adjustment) {
          return [adjustment];
        }
      } catch {
        recoveryStack.pop();
        appendError(
          createErrorRecord({
            cycle,
            source: "module",
            code: "MODULE_STEP_UP_FAILED",
            message: `Module "${moduleId}" could not be restored during recovery handling.`,
            retryable: true,
            moduleId,
            correlationId,
          }),
          decisionErrors
        );
      }
    }

    return [];
  };

  return {
    recordFrame(sample) {
      if (!sample || typeof sample !== "object") {
        throw new Error("recordFrame requires a frame sample object.");
      }

      validateFrameSample(sample);

      if (sample.signal?.aborted) {
        return buildIgnoredDecision(
          "Ignored frame sample because its AbortSignal was already aborted."
        );
      }

      if (sample.frameId && !rememberFrameId(sample.frameId)) {
        return buildIgnoredDecision(
          `Ignored duplicate frame sample "${sample.frameId}".`
        );
      }

      cycle += 1;
      const decisionErrors: GovernorErrorRecord[] = [];
      lastThermalState = sample.thermalState ?? lastThermalState;
      emaFrameTimeMs =
        cycle === 1
          ? sample.frameTimeMs
          : sample.frameTimeMs * adaptation.emaAlpha +
            emaFrameTimeMs * (1 - adaptation.emaAlpha);

      samples = [...samples, sample].slice(-adaptation.sampleWindowSize);

      const metrics = createMetrics(
        samples,
        emaFrameTimeMs,
        target.targetFrameTimeMs,
        lastThermalState
      );
      const workerGraph = buildWorkerGraphSummary(getModuleSnapshots());
      const pressureLevel = classifyCurrentPressure(metrics);

      if (pressureLevel === "recovering" || pressureLevel === "stable") {
        stableRecoveryFrames += 1;
      } else {
        stableRecoveryFrames = 0;
      }

      let adjustments: PerformanceAdjustmentRecord[] = [];
      const enoughSamples =
        metrics.sampleCount >= adaptation.minimumSamplesBeforeAdjustment;

      if (
        enoughSamples &&
        (pressureLevel === "elevated" ||
          pressureLevel === "critical" ||
          pressureLevel === "starved") &&
        (pressureLevel === "starved" ||
          cycle - lastDownCycle >= adaptation.degradeCooldownFrames)
      ) {
        adjustments = attemptDowngrade(
          pressureLevel,
          metrics,
          workerGraph,
          decisionErrors,
          sample.frameId
        );
        if (adjustments.length > 0) {
          lastDownCycle = cycle;
          stableRecoveryFrames = 0;
        }
      } else if (
        enoughSamples &&
        pressureLevel === "recovering" &&
        stableRecoveryFrames >= adaptation.minStableFramesForRecovery &&
        cycle - lastUpCycle >= adaptation.upgradeCooldownFrames
      ) {
        adjustments = attemptRecovery(
          metrics,
          workerGraph,
          decisionErrors,
          sample.frameId
        );
        if (adjustments.length > 0) {
          lastUpCycle = cycle;
          stableRecoveryFrames = 0;
        }
      }

      const decision = buildDecision(
        true,
        pressureLevel,
        metrics,
        workerGraph,
        adjustments,
        decisionErrors,
        buildReason(pressureLevel, metrics, workerGraph)
      );

      emitTelemetry(
        options.telemetry?.onDecision,
        decision,
        () =>
          createErrorRecord({
            cycle,
            source: "telemetry",
            code: "TELEMETRY_DECISION_HOOK_FAILED",
            message: "Decision telemetry callback failed.",
            retryable: true,
            correlationId: sample.frameId,
          }),
        decisionErrors
      );

      const finalizedDecision =
        decisionErrors.length === 0
          ? decision
          : {
              ...decision,
              errors: [...decisionErrors],
            };

      lastDecision = finalizedDecision;
      return finalizedDecision;
    },
    registerModule(module) {
      validateModuleAdapter(module);
      if (modules.has(module.id)) {
        throw new Error(`Module "${module.id}" is already registered.`);
      }

      modules.set(module.id, module);

      return () => {
        modules.delete(module.id);
        recoveryStack = recoveryStack.filter((id) => id !== module.id);
      };
    },
    getTarget() {
      return target;
    },
    getState(): GovernorState {
      const moduleSnapshots = getModuleSnapshots();
      return {
        cycle,
        target,
        device,
        metrics: lastDecision?.metrics ?? null,
        modules: moduleSnapshots,
        workerGraph: buildWorkerGraphSummary(moduleSnapshots),
        lastDecision,
        recentErrors,
      };
    },
    reset() {
      cycle = 0;
      samples = [];
      emaFrameTimeMs = target.targetFrameTimeMs;
      lastThermalState = device.thermalState;
      lastDecision = null;
      stableRecoveryFrames = 0;
      lastDownCycle = Number.NEGATIVE_INFINITY;
      lastUpCycle = Number.NEGATIVE_INFINITY;
      recoveryStack = [];
      recentErrors = [];
      recentFrameIds = new Set();
      recentFrameIdQueue = [];
    },
  };
}

/**
 * Alias for createGpuPerformanceGovernor.
 */
export const createPerformanceGovernor = createGpuPerformanceGovernor;
