import { createQualityLadderAdapter } from "./ladder.js";
import type {
  ModuleQualityLevel,
  WorkerJobBudgetAdapter,
  WorkerJobBudgetManifest,
  WorkerJobBudgetManifestGraph,
  WorkerJobBudgetManifestGraphJob,
  WorkerJobBudgetManifestPriorityLane,
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

function buildPriorityLanes(
  jobs: readonly WorkerJobBudgetManifestGraphJob[]
): readonly WorkerJobBudgetManifestPriorityLane[] {
  const lanes = new Map<number, {
    priority: number;
    jobIds: string[];
    rootJobIds: string[];
  }>();

  for (const job of jobs) {
    const lane = lanes.get(job.priority) ?? {
      priority: job.priority,
      jobIds: [],
      rootJobIds: [],
    };
    lane.jobIds.push(job.id);
    if (job.root) {
      lane.rootJobIds.push(job.id);
    }
    lanes.set(job.priority, lane);
  }

  return Object.freeze(
    [...lanes.values()]
      .sort((left, right) => right.priority - left.priority)
      .map((lane) =>
        Object.freeze({
          priority: lane.priority,
          jobIds: Object.freeze([...lane.jobIds]),
          rootJobIds: Object.freeze([...lane.rootJobIds]),
          jobCount: lane.jobIds.length,
          rootCount: lane.rootJobIds.length,
        })
      )
  );
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

function buildManifestGraph(
  manifest: WorkerJobBudgetManifest | readonly WorkerJobBudgetManifestJob[]
): WorkerJobBudgetManifestGraph {
  const jobs = normalizeManifestJobs(manifest);
  const normalized = jobs.map((job, index) => {
    if (!isPlainObject(job.performance)) {
      throw new Error(`Manifest job ${index} must provide a performance object.`);
    }

    const id = assertIdentifier(`jobs[${index}].performance.id`, job.performance.id);

    return {
      id,
      key: typeof job.key === "string" ? job.key : undefined,
      label: typeof job.label === "string" ? job.label : undefined,
      jobType: resolveManifestJobType(job, index),
      queueClass: resolveManifestQueueClass(job, index),
      priority: resolveManifestPriority(job, index),
      dependencies: resolveManifestDependencies(job, index),
      schedulerMode: resolveManifestSchedulerMode(manifest, job, index),
    };
  });

  const ids = new Set<string>();
  for (const job of normalized) {
    if (ids.has(job.id)) {
      throw new Error(`Duplicate worker manifest job id detected: ${job.id}`);
    }
    ids.add(job.id);
  }

  for (const job of normalized) {
    for (const dependency of job.dependencies) {
      if (!ids.has(dependency)) {
        throw new Error(
          `Worker manifest job "${job.id}" depends on unknown job "${dependency}".`
        );
      }
      if (dependency === job.id) {
        throw new Error(`Worker manifest job "${job.id}" cannot depend on itself.`);
      }
    }
  }

  const dependentsById = new Map(normalized.map((job) => [job.id, [] as string[]]));
  const indegree = new Map(
    normalized.map((job) => [job.id, job.dependencies.length] as const)
  );

  for (const job of normalized) {
    for (const dependency of job.dependencies) {
      dependentsById.get(dependency)?.push(job.id);
    }
  }

  const roots = normalized
    .filter((job) => job.dependencies.length === 0)
    .map((job) => job.id);
  const queue = [...roots];
  const topologicalOrder: string[] = [];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) {
      continue;
    }
    topologicalOrder.push(currentId);
    for (const dependentId of dependentsById.get(currentId) ?? []) {
      const next = (indegree.get(dependentId) ?? 0) - 1;
      indegree.set(dependentId, next);
      if (next === 0) {
        queue.push(dependentId);
      }
    }
  }

  if (topologicalOrder.length !== normalized.length) {
    throw new Error("Worker manifest graph contains a cycle.");
  }

  const graphJobs = normalized.map((job) =>
    Object.freeze({
      ...job,
      dependencies: Object.freeze([...job.dependencies]),
      dependents: Object.freeze([...(dependentsById.get(job.id) ?? [])]),
      dependencyCount: job.dependencies.length,
      unresolvedDependencyCount: job.dependencies.length,
      dependentCount: (dependentsById.get(job.id) ?? []).length,
      root: job.dependencies.length === 0,
    })
  );

  return Object.freeze({
    schedulerMode: graphJobs.some(
      (job) => job.schedulerMode === "dag" || job.dependencies.length > 0
    )
      ? "dag"
      : "flat",
    jobCount: graphJobs.length,
    maxPriority: graphJobs.reduce(
      (current, job) => Math.max(current, job.priority),
      0
    ),
    jobIds: Object.freeze(graphJobs.map((job) => job.id)),
    roots: Object.freeze(graphJobs.filter((job) => job.root).map((job) => job.id)),
    topologicalOrder: Object.freeze(topologicalOrder),
    priorityLanes: buildPriorityLanes(graphJobs),
    jobs: Object.freeze(graphJobs),
  });
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
  const dependents = normalizeDependencies("dependents", options.dependents);
  const schedulerMode =
    options.schedulerMode === undefined
      ? "flat"
      : assertEnumValue("schedulerMode", options.schedulerMode, workerSchedulerModes);
  const dependencyCount = dependencies.length;
  const unresolvedDependencyCount = dependencyCount;
  const dependentCount = dependents.length;
  const root = dependencyCount === 0;

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
    dependents,
    dependencyCount,
    unresolvedDependencyCount,
    dependentCount,
    root,
    schedulerMode,
  });

  return {
    ...ladder,
    jobType,
    queueClass,
    priority,
    dependencies,
    dependents,
    dependencyCount,
    unresolvedDependencyCount,
    dependentCount,
    root,
    schedulerMode,
    getSnapshot() {
      return getWorkerSnapshot();
    },
    getBudget() {
      return ladder.getCurrentLevel().config;
    },
    getWorkerSnapshot,
  };
}

/**
 * Normalizes a worker manifest into a graph with roots, dependents, and
 * priority lanes so runtimes can reason about multi-root DAG workloads.
 */
export function createWorkerJobBudgetManifestGraph(
  manifest: WorkerJobBudgetManifest | readonly WorkerJobBudgetManifestJob[]
): WorkerJobBudgetManifestGraph {
  return buildManifestGraph(manifest);
}

/**
 * Creates worker budget adapters from a consumer worker-manifest shape.
 */
export function createWorkerJobBudgetAdaptersFromManifest(
  manifest: WorkerJobBudgetManifest | readonly WorkerJobBudgetManifestJob[],
  options: WorkerJobBudgetManifestAdapterOptions = {}
): readonly WorkerJobBudgetAdapter[] {
  const graph = buildManifestGraph(manifest);
  const graphJobById = new Map(graph.jobs.map((job) => [job.id, job]));
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
    const graphJob = graphJobById.get(id);
    if (!graphJob) {
      throw new Error(`Worker manifest graph is missing job "${id}".`);
    }

    return [
      createWorkerJobBudgetAdapter({
        id,
        jobType: graphJob.jobType,
        queueClass: graphJob.queueClass,
        priority: graphJob.priority,
        dependencies: graphJob.dependencies,
        dependents: graphJob.dependents,
        schedulerMode: graphJob.schedulerMode,
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
