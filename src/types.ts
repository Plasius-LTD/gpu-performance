/**
 * Supported runtime presentation modes.
 */
export type RuntimeMode = "flat" | "immersive-vr" | "immersive-ar";

/**
 * Coarse hardware class used for frame-target negotiation defaults.
 */
export type DeviceClass =
  | "mobile"
  | "tablet"
  | "desktop"
  | "xr-headset"
  | "unknown";

/**
 * Coarse GPU capability tier.
 */
export type GpuTier = "low" | "mid" | "high" | "ultra" | "unknown";

/**
 * Thermal state hints supplied by the host runtime.
 */
export type ThermalState = "nominal" | "fair" | "serious" | "critical";

/**
 * Common GPU-heavy module domains the governor can prioritize.
 */
export type PerformanceDomain =
  | "resolution"
  | "shadows"
  | "volumetrics"
  | "reflections"
  | "post-processing"
  | "lighting"
  | "particles"
  | "cloth"
  | "geometry"
  | "textures"
  | "animation"
  | "xr"
  | "physics"
  | "custom";

/**
 * Shared worker queue classes used to group GPU work across packages.
 */
export type WorkerJobQueueClass =
  | "render"
  | "simulation"
  | "lighting"
  | "post-processing"
  | "voxel"
  | "custom";

/**
 * Scheduler shape used by worker-capable packages.
 */
export type WorkerSchedulerMode = "flat" | "dag";

/**
 * Safety classification for automatic adaptation.
 */
export type ModuleAuthority =
  | "visual"
  | "non-authoritative-simulation"
  | "authoritative";

/**
 * Business importance used to rank modules during degradation and recovery.
 */
export type ModuleImportance = "low" | "medium" | "high" | "critical";

/**
 * Pressure states emitted by the governor after each frame sample.
 */
export type PressureLevel =
  | "stable"
  | "recovering"
  | "elevated"
  | "critical"
  | "starved";

/**
 * Input contract for describing the current device and runtime mode.
 */
export interface DeviceProfileInput {
  deviceClass?: DeviceClass;
  mode?: RuntimeMode;
  refreshRateHz?: number;
  supportedFrameRates?: readonly number[];
  gpuTier?: GpuTier;
  supportsWebGpu?: boolean;
  supportsFoveation?: boolean;
  thermalState?: ThermalState;
  metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Normalized device profile used by the governor.
 */
export interface DeviceProfile {
  deviceClass: DeviceClass;
  mode: RuntimeMode;
  refreshRateHz: number;
  supportedFrameRates: readonly number[];
  gpuTier: GpuTier;
  supportsWebGpu: boolean;
  supportsFoveation: boolean;
  thermalState: ThermalState;
  metadata: Readonly<Record<string, unknown>>;
}

/**
 * Inputs used to negotiate a frame target for the active device and mode.
 */
export interface FrameTargetNegotiationOptions {
  mode?: RuntimeMode;
  deviceRefreshRateHz?: number;
  supportedFrameRates?: readonly number[];
  preferredFrameRates?: readonly number[];
  minimumFrameRate?: number;
  maximumFrameRate?: number;
}

/**
 * Negotiated frame target and guardrails used by the control loop.
 */
export interface FrameTargetProfile {
  mode: RuntimeMode;
  minimumFrameRate: number;
  targetFrameRate: number;
  targetFrameTimeMs: number;
  downgradeFrameTimeMs: number;
  upgradeFrameTimeMs: number;
  candidateFrameRates: readonly number[];
  rationale: readonly string[];
}

/**
 * Per-frame input data fed into the governor.
 */
export interface FrameSample {
  frameTimeMs: number;
  cpuTimeMs?: number;
  gpuTimeMs?: number;
  dropped?: boolean;
  thermalState?: ThermalState;
  timestampMs?: number;
  frameId?: string;
  signal?: AbortSignal;
}

/**
 * Aggregated metrics derived from the rolling sample window.
 */
export interface GovernorMetrics {
  sampleCount: number;
  fps: number;
  latestFrameTimeMs: number;
  averageFrameTimeMs: number;
  emaFrameTimeMs: number;
  p95FrameTimeMs: number;
  averageCpuTimeMs?: number;
  averageGpuTimeMs?: number;
  targetFrameTimeMs: number;
  frameTimeDeltaMs: number;
  trendDeltaMs: number;
  dropRatio: number;
  thermalState: ThermalState;
}

/**
 * Discrete quality level exposed by a module adapter.
 */
export interface ModuleQualityLevel<Payload = unknown> {
  id: string;
  label?: string;
  config: Payload;
  estimatedCostMs?: number;
}

/**
 * Snapshot of the current state of a module ladder.
 */
export interface PerformanceModuleSnapshot<Payload = unknown> {
  id: string;
  domain: PerformanceDomain;
  authority: ModuleAuthority;
  importance: ModuleImportance;
  currentLevelIndex: number;
  currentLevel: ModuleQualityLevel<Payload>;
  levelCount: number;
  isAtMinimum: boolean;
  isAtMaximum: boolean;
  estimatedCostMs?: number;
}

/**
 * Context passed to adapters when quality is being changed.
 */
export interface PerformanceAdjustmentContext {
  cycle: number;
  cause: "degrade" | "recover";
  pressureLevel: PressureLevel;
  metrics: GovernorMetrics;
  target: FrameTargetProfile;
}

/**
 * Record emitted when a module changes quality.
 */
export interface PerformanceAdjustmentRecord<Payload = unknown> {
  moduleId: string;
  domain: PerformanceDomain;
  authority: ModuleAuthority;
  importance: ModuleImportance;
  direction: "down" | "up";
  fromLevelIndex: number;
  toLevelIndex: number;
  fromLevelId: string;
  toLevelId: string;
  appliedConfig: Payload;
  reason: string;
}

/**
 * Structured runtime error record emitted for bounded failure reporting.
 */
export interface GovernorErrorRecord {
  cycle: number;
  source: "governor" | "module" | "telemetry";
  code: string;
  message: string;
  retryable: boolean;
  moduleId?: string;
  correlationId?: string;
}

/**
 * Contract implemented by all governor-managed modules.
 */
export interface PerformanceModuleAdapter<Payload = unknown> {
  id: string;
  domain: PerformanceDomain;
  authority: ModuleAuthority;
  importance: ModuleImportance;
  getSnapshot(): PerformanceModuleSnapshot<Payload>;
  stepDown(
    context: PerformanceAdjustmentContext
  ): PerformanceAdjustmentRecord<Payload> | null;
  stepUp(
    context: PerformanceAdjustmentContext
  ): PerformanceAdjustmentRecord<Payload> | null;
}

/**
 * Event emitted by quality ladder adapters when their level changes.
 */
export interface QualityLadderChangeEvent<Payload = unknown> {
  context: PerformanceAdjustmentContext;
  previousLevel: ModuleQualityLevel<Payload>;
  currentLevel: ModuleQualityLevel<Payload>;
  adjustment: PerformanceAdjustmentRecord<Payload>;
}

/**
 * Options for creating a ladder-backed module adapter.
 */
export interface QualityLadderAdapterOptions<Payload = unknown> {
  id: string;
  domain: PerformanceDomain;
  authority?: ModuleAuthority;
  importance?: ModuleImportance;
  levels: readonly ModuleQualityLevel<Payload>[];
  initialLevel?: number | string;
  onLevelChange?: (event: QualityLadderChangeEvent<Payload>) => void;
}

/**
 * Public surface for ladder-backed adapters.
 */
export interface QualityLadderAdapter<Payload = unknown>
  extends PerformanceModuleAdapter<Payload> {
  getCurrentLevel(): ModuleQualityLevel<Payload>;
}

/**
 * Budget controls applied to a gpu-worker job type.
 */
export interface WorkerJobBudgetConfig {
  maxDispatchesPerFrame: number;
  maxJobsPerDispatch: number;
  cadenceDivisor?: number;
  workgroupScale?: number;
  maxQueueDepth?: number;
  metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Options for creating a worker-job budget adapter.
 */
export interface WorkerJobBudgetAdapterOptions {
  id: string;
  jobType: string;
  queueClass?: WorkerJobQueueClass;
  priority?: number;
  dependencies?: readonly string[];
  dependents?: readonly string[];
  schedulerMode?: WorkerSchedulerMode;
  domain?: PerformanceDomain;
  authority?: ModuleAuthority;
  importance?: ModuleImportance;
  levels: readonly ModuleQualityLevel<WorkerJobBudgetConfig>[];
  initialLevel?: number | string;
  onLevelChange?: (event: QualityLadderChangeEvent<WorkerJobBudgetConfig>) => void;
}

/**
 * Manifest-friendly description of a worker job budget.
 */
export interface WorkerJobBudgetManifestPerformance {
  id: string;
  jobType?: string;
  queueClass?: WorkerJobQueueClass;
  domain?: PerformanceDomain;
  authority?: ModuleAuthority;
  importance?: ModuleImportance;
  levels: readonly ModuleQualityLevel<WorkerJobBudgetConfig>[];
}

/**
 * Single worker job entry emitted by adopting gpu-* packages.
 */
export interface WorkerJobBudgetManifestJob {
  key?: string;
  label?: string;
  worker?: {
    jobType?: string;
    queueClass?: WorkerJobQueueClass;
    priority?: number;
    dependencies?: readonly string[];
    schedulerMode?: WorkerSchedulerMode;
  };
  performance: WorkerJobBudgetManifestPerformance;
  debug?: Readonly<Record<string, unknown>>;
}

/**
 * Top-level worker manifest emitted by adopting gpu-* packages.
 */
export interface WorkerJobBudgetManifest {
  schemaVersion?: number;
  owner?: string;
  queueClass?: WorkerJobQueueClass;
  schedulerMode?: WorkerSchedulerMode;
  jobs: readonly WorkerJobBudgetManifestJob[];
}

/**
 * Options for converting a consumer worker manifest into budget adapters.
 */
export interface WorkerJobBudgetManifestAdapterOptions {
  initialLevels?: Readonly<Record<string, number | string>>;
  selectJob?: (job: WorkerJobBudgetManifestJob, index: number) => boolean;
  onLevelChange?: (
    job: WorkerJobBudgetManifestJob,
    event: QualityLadderChangeEvent<WorkerJobBudgetConfig>
  ) => void;
}

/**
 * Normalized DAG node derived from a worker manifest.
 */
export interface WorkerJobBudgetManifestGraphJob {
  id: string;
  key?: string;
  label?: string;
  jobType: string;
  queueClass: WorkerJobQueueClass;
  priority: number;
  dependencies: readonly string[];
  dependents: readonly string[];
  dependencyCount: number;
  unresolvedDependencyCount: number;
  dependentCount: number;
  root: boolean;
  schedulerMode: WorkerSchedulerMode;
}

/**
 * Priority lane summary derived from a worker manifest DAG.
 */
export interface WorkerJobBudgetManifestPriorityLane {
  priority: number;
  jobIds: readonly string[];
  rootJobIds: readonly string[];
  jobCount: number;
  rootCount: number;
}

/**
 * Normalized DAG summary derived from a worker manifest.
 */
export interface WorkerJobBudgetManifestGraph {
  schedulerMode: WorkerSchedulerMode;
  jobCount: number;
  maxPriority: number;
  jobIds: readonly string[];
  roots: readonly string[];
  topologicalOrder: readonly string[];
  priorityLanes: readonly WorkerJobBudgetManifestPriorityLane[];
  jobs: readonly WorkerJobBudgetManifestGraphJob[];
}

/**
 * Snapshot of a worker-job budget adapter.
 */
export interface WorkerJobBudgetSnapshot
  extends PerformanceModuleSnapshot<WorkerJobBudgetConfig> {
  jobType: string;
  queueClass: WorkerJobQueueClass;
  priority: number;
  dependencies: readonly string[];
  dependents: readonly string[];
  dependencyCount: number;
  unresolvedDependencyCount: number;
  dependentCount: number;
  root: boolean;
  schedulerMode: WorkerSchedulerMode;
}

/**
 * Public surface for worker-job budget adapters.
 */
export interface WorkerJobBudgetAdapter
  extends QualityLadderAdapter<WorkerJobBudgetConfig> {
  jobType: string;
  queueClass: WorkerJobQueueClass;
  priority: number;
  dependencies: readonly string[];
  dependents: readonly string[];
  dependencyCount: number;
  unresolvedDependencyCount: number;
  dependentCount: number;
  root: boolean;
  schedulerMode: WorkerSchedulerMode;
  getBudget(): WorkerJobBudgetConfig;
  getWorkerSnapshot(): WorkerJobBudgetSnapshot;
}

/**
 * Runtime hooks emitted by the governor. If callers need analytics batching or
 * transport, they should route these events through @plasius/analytics rather
 * than implementing analytics delivery in this package.
 */
export interface PerformanceTelemetryHooks {
  onTargetNegotiated?: (target: FrameTargetProfile) => void;
  onDecision?: (decision: GovernorDecision) => void;
  onError?: (error: GovernorErrorRecord) => void;
}

/**
 * Tuning knobs for adaptation responsiveness and hysteresis.
 */
export interface GovernorAdaptationOptions {
  sampleWindowSize?: number;
  minimumSamplesBeforeAdjustment?: number;
  degradeCooldownFrames?: number;
  upgradeCooldownFrames?: number;
  minStableFramesForRecovery?: number;
  trendSensitivityMs?: number;
  emaAlpha?: number;
  maxStepChangesPerCycle?: number;
  allowAuthoritativeScaling?: boolean;
  domainOrder?: readonly PerformanceDomain[];
  maxRetainedErrors?: number;
  maxRetainedFrameIds?: number;
}

/**
 * Creation options for the performance governor.
 */
export interface GpuPerformanceGovernorOptions {
  device: DeviceProfileInput | DeviceProfile;
  target?: FrameTargetNegotiationOptions;
  modules?: readonly PerformanceModuleAdapter[];
  adaptation?: GovernorAdaptationOptions;
  telemetry?: PerformanceTelemetryHooks;
}

/**
 * Decision emitted after each recorded frame.
 */
export interface GovernorDecision {
  cycle: number;
  processed: boolean;
  pressureLevel: PressureLevel;
  metrics: GovernorMetrics;
  adjustments: readonly PerformanceAdjustmentRecord[];
  errors: readonly GovernorErrorRecord[];
  reason: string;
}

/**
 * Snapshot of governor state for debug surfaces and tests.
 */
export interface GovernorState {
  cycle: number;
  target: FrameTargetProfile;
  device: DeviceProfile;
  metrics: GovernorMetrics | null;
  modules: readonly PerformanceModuleSnapshot[];
  lastDecision: GovernorDecision | null;
  recentErrors: readonly GovernorErrorRecord[];
}

/**
 * Public runtime API exposed by the governor.
 */
export interface PerformanceGovernor {
  recordFrame(sample: FrameSample): GovernorDecision;
  registerModule(module: PerformanceModuleAdapter): () => void;
  getTarget(): FrameTargetProfile;
  getState(): GovernorState;
  reset(): void;
}
