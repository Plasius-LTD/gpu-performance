import { createQualityLadderAdapter } from "./ladder.js";
import type {
  ModuleQualityLevel,
  WorkerJobBudgetAdapter,
  WorkerJobBudgetManifest,
  WorkerJobBudgetManifestAdapterOptions,
  WorkerJobBudgetManifestJob,
  WorkerJobBudgetAdapterOptions,
  WorkerJobBudgetConfig,
  WorkerJobBudgetSnapshot,
} from "./types.js";
import {
  assertEnumValue,
  assertIdentifier,
  normalizePlainObject,
  readNonNegativeNumber,
  readPositiveNumber,
  workerJobQueueClasses,
  workerSchedulerModes,
} from "./validation.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPositiveInteger(name: string, value: unknown): number | undefined {
  const parsed = readPositiveNumber(name, value);
  if (parsed === undefined) {
    return undefined;
  }

  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer greater than zero.`);
  }

  return parsed;
}

function readNonNegativeInteger(name: string, value: unknown): number | undefined {
  const parsed = readNonNegativeNumber(name, value);
  if (parsed === undefined) {
    return undefined;
  }

  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer greater than or equal to zero.`);
  }

  return parsed;
}

function normalizeDependencies(
  name: string,
  value: unknown
): readonly string[] {
  if (value === undefined) {
    return Object.freeze([]);
  }

  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array of dependency ids.`);
  }

  return Object.freeze(
    [...new Set(value.map((entry, index) => assertIdentifier(`${name}[${index}]`, entry)))]
  );
}

function normalizeBudgetLevel(
  level: ModuleQualityLevel<WorkerJobBudgetConfig>,
  index: number
): ModuleQualityLevel<WorkerJobBudgetConfig> {
  if (!isPlainObject(level.config)) {
    throw new Error(`Worker job budget level ${index} must provide an object config.`);
  }

  const levelId = assertIdentifier(`levels[${index}].id`, level.id);
  const maxDispatchesPerFrame = readPositiveInteger(
    `levels[${index}].config.maxDispatchesPerFrame`,
    level.config.maxDispatchesPerFrame
  );
  const maxJobsPerDispatch = readPositiveInteger(
    `levels[${index}].config.maxJobsPerDispatch`,
    level.config.maxJobsPerDispatch
  );
  const cadenceDivisor = readPositiveInteger(
    `levels[${index}].config.cadenceDivisor`,
    level.config.cadenceDivisor
  );
  const workgroupScale = readPositiveNumber(
    `levels[${index}].config.workgroupScale`,
    level.config.workgroupScale
  );
  const maxQueueDepth = readNonNegativeInteger(
    `levels[${index}].config.maxQueueDepth`,
    level.config.maxQueueDepth
  );

  if (workgroupScale !== undefined && workgroupScale > 1) {
    throw new Error(
      `levels[${index}].config.workgroupScale must be less than or equal to 1.`
    );
  }

  return {
    ...level,
    id: levelId,
    config: {
      maxDispatchesPerFrame: maxDispatchesPerFrame ?? 1,
      maxJobsPerDispatch: maxJobsPerDispatch ?? 1,
      cadenceDivisor,
      workgroupScale,
      maxQueueDepth,
      metadata: normalizePlainObject(
        `levels[${index}].config.metadata`,
        level.config.metadata
      ),
    },
  };
}

function normalizeManifestJobs(
  manifest: WorkerJobBudgetManifest | readonly WorkerJobBudgetManifestJob[]
): readonly WorkerJobBudgetManifestJob[] {
  if (Array.isArray(manifest)) {
    return manifest;
  }

  if (!isPlainObject(manifest) || !Array.isArray(manifest.jobs)) {
    throw new Error(
      "Worker job manifests must provide a jobs array or be an array of jobs."
    );
  }

  return manifest.jobs;
}

function resolveManifestJobType(job: WorkerJobBudgetManifestJob, index: number): string {
  const jobType = job.performance?.jobType ?? job.worker?.jobType;
  if (typeof jobType !== "string") {
    throw new Error(
      `Manifest job ${index} must provide performance.jobType or worker.jobType.`
    );
  }

  return assertIdentifier(`jobs[${index}].jobType`, jobType);
}

function resolveManifestQueueClass(
  job: WorkerJobBudgetManifestJob,
  index: number
): WorkerJobBudgetAdapter["queueClass"] {
  const queueClass = job.performance?.queueClass ?? job.worker?.queueClass;
  if (queueClass === undefined) {
    throw new Error(
      `Manifest job ${index} must provide performance.queueClass or worker.queueClass.`
    );
  }

  return assertEnumValue(`jobs[${index}].queueClass`, queueClass, workerJobQueueClasses);
}

function resolveManifestSchedulerMode(
  manifest: WorkerJobBudgetManifest | readonly WorkerJobBudgetManifestJob[],
  job: WorkerJobBudgetManifestJob,
  index: number
): WorkerJobBudgetAdapter["schedulerMode"] {
  const topLevelMode =
    !Array.isArray(manifest) && isPlainObject(manifest)
      ? manifest.schedulerMode
      : undefined;
  const schedulerMode = job.worker?.schedulerMode ?? topLevelMode;

  if (schedulerMode === undefined) {
    return "flat";
  }

  return assertEnumValue(
    `jobs[${index}].schedulerMode`,
    schedulerMode,
    workerSchedulerModes
  );
}

function resolveManifestDependencies(
  job: WorkerJobBudgetManifestJob,
  index: number
): readonly string[] {
  return normalizeDependencies(
    `jobs[${index}].dependencies`,
    job.worker?.dependencies
  );
}

function resolveManifestPriority(
  job: WorkerJobBudgetManifestJob,
  index: number
): number {
  return readNonNegativeInteger(
    `jobs[${index}].priority`,
    job.worker?.priority
  ) ?? 0;
}

/**
 * Creates a ladder-backed adapter specialized for gpu-worker job budgets.
 */
export function createWorkerJobBudgetAdapter(
  options: WorkerJobBudgetAdapterOptions
): WorkerJobBudgetAdapter {
  const jobType = assertIdentifier("jobType", options.jobType);
  const queueClass =
    options.queueClass === undefined
      ? "custom"
      : assertEnumValue("queueClass", options.queueClass, workerJobQueueClasses);
  const priority = readNonNegativeInteger("priority", options.priority) ?? 0;
  const dependencies = normalizeDependencies("dependencies", options.dependencies);
  const schedulerMode =
    options.schedulerMode === undefined
      ? "flat"
      : assertEnumValue("schedulerMode", options.schedulerMode, workerSchedulerModes);

  const levels = options.levels.map(normalizeBudgetLevel);

  const ladder = createQualityLadderAdapter<WorkerJobBudgetConfig>({
    id: options.id,
    domain: options.domain ?? "custom",
    authority: options.authority,
    importance: options.importance,
    levels,
    initialLevel: options.initialLevel,
    onLevelChange: options.onLevelChange,
  });

  const getWorkerSnapshot = (): WorkerJobBudgetSnapshot => ({
    ...ladder.getSnapshot(),
    jobType,
    queueClass,
    priority,
    dependencies,
    schedulerMode,
  });

  return {
    ...ladder,
    jobType,
    queueClass,
    priority,
    dependencies,
    schedulerMode,
    getBudget() {
      return ladder.getCurrentLevel().config;
    },
    getWorkerSnapshot,
  };
}

/**
 * Creates worker budget adapters from a consumer worker-manifest shape.
 */
export function createWorkerJobBudgetAdaptersFromManifest(
  manifest: WorkerJobBudgetManifest | readonly WorkerJobBudgetManifestJob[],
  options: WorkerJobBudgetManifestAdapterOptions = {}
): readonly WorkerJobBudgetAdapter[] {
  const jobs = normalizeManifestJobs(manifest);
  const { initialLevels, selectJob, onLevelChange } = options;

  return jobs.flatMap((job, index) => {
    if (selectJob && !selectJob(job, index)) {
      return [];
    }

    if (!isPlainObject(job.performance)) {
      throw new Error(`Manifest job ${index} must provide a performance object.`);
    }

    const id = assertIdentifier(`jobs[${index}].performance.id`, job.performance.id);
    const jobType = resolveManifestJobType(job, index);
    const queueClass = resolveManifestQueueClass(job, index);
    const schedulerMode = resolveManifestSchedulerMode(manifest, job, index);
    const dependencies = resolveManifestDependencies(job, index);
    const priority = resolveManifestPriority(job, index);

    return [
      createWorkerJobBudgetAdapter({
        id,
        jobType,
        queueClass,
        priority,
        dependencies,
        schedulerMode,
        domain: job.performance.domain,
        authority: job.performance.authority,
        importance: job.performance.importance,
        levels: job.performance.levels,
        initialLevel: initialLevels?.[id],
        onLevelChange:
          onLevelChange === undefined
            ? undefined
            : (event) => {
                onLevelChange(job, event);
              },
      }),
    ];
  });
}
