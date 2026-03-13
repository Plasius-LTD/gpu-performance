import { createQualityLadderAdapter } from "./ladder.js";
import type {
  ModuleQualityLevel,
  WorkerJobBudgetAdapter,
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
  });

  return {
    ...ladder,
    jobType,
    queueClass,
    getBudget() {
      return ladder.getCurrentLevel().config;
    },
    getWorkerSnapshot,
  };
}
