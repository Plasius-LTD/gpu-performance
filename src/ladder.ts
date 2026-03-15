import type {
  ModuleImportance,
  ModuleQualityLevel,
  ModuleAuthority,
  PerformanceBudgetMetadata,
  PerformanceAdjustmentContext,
  PerformanceAdjustmentRecord,
  PerformanceDomain,
  PerformanceModuleSnapshot,
  QualityLadderAdapter,
  QualityLadderAdapterOptions,
} from "./types.js";
import { normalizePerformanceBudgetMetadata } from "./budget.js";
import {
  assertEnumValue,
  assertIdentifier,
  moduleAuthorities,
  moduleImportances,
  performanceDomains,
  readNonNegativeNumber,
} from "./validation.js";

function resolveLevelIndex<Payload>(
  levels: readonly ModuleQualityLevel<Payload>[],
  initialLevel: number | string | undefined
): number {
  if (typeof initialLevel === "number") {
    if (initialLevel < 0 || initialLevel >= levels.length) {
      throw new Error(`Initial level index ${initialLevel} is out of range.`);
    }

    return initialLevel;
  }

  if (typeof initialLevel === "string") {
    const index = levels.findIndex((level) => level.id === initialLevel);
    if (index < 0) {
      throw new Error(`Initial level "${initialLevel}" does not exist in the ladder.`);
    }

    return index;
  }

  return levels.length - 1;
}

function assertUniqueLevelIds<Payload>(
  levels: readonly ModuleQualityLevel<Payload>[]
): void {
  const seen = new Set<string>();

  for (const level of levels) {
    assertIdentifier("levels[].id", level.id);

    if (readNonNegativeNumber(`estimatedCostMs for level "${level.id}"`, level.estimatedCostMs) === undefined) {
      // no-op
    }

    if (seen.has(level.id)) {
      throw new Error(`Duplicate ladder level id "${level.id}" detected.`);
    }

    seen.add(level.id);
  }
}

function buildSnapshot<Payload>(
  id: string,
  domain: PerformanceDomain,
  authority: ModuleAuthority,
  importance: ModuleImportance,
  metadata: PerformanceBudgetMetadata,
  levels: readonly ModuleQualityLevel<Payload>[],
  currentLevelIndex: number
): PerformanceModuleSnapshot<Payload> {
  const currentLevel = levels[currentLevelIndex]!;

  return {
    id,
    domain,
    authority,
    importance,
    representationBand: metadata.representationBand,
    qualityDimensions: metadata.qualityDimensions,
    importanceSignals: metadata.importanceSignals,
    currentLevelIndex,
    currentLevel,
    levelCount: levels.length,
    isAtMinimum: currentLevelIndex === 0,
    isAtMaximum: currentLevelIndex === levels.length - 1,
    estimatedCostMs: currentLevel.estimatedCostMs,
  };
}

function buildAdjustment<Payload>(
  direction: "down" | "up",
  id: string,
  domain: PerformanceDomain,
  authority: ModuleAuthority,
  importance: ModuleImportance,
  previousLevelIndex: number,
  nextLevelIndex: number,
  levels: readonly ModuleQualityLevel<Payload>[],
  context: PerformanceAdjustmentContext
): PerformanceAdjustmentRecord<Payload> {
  const previousLevel = levels[previousLevelIndex]!;
  const nextLevel = levels[nextLevelIndex]!;

  return {
    moduleId: id,
    domain,
    authority,
    importance,
    direction,
    fromLevelIndex: previousLevelIndex,
    toLevelIndex: nextLevelIndex,
    fromLevelId: previousLevel.id,
    toLevelId: nextLevel.id,
    appliedConfig: nextLevel.config,
    reason:
      direction === "down"
        ? `Reduced ${id} while ${context.pressureLevel} pressure exceeded the negotiated frame budget.`
        : `Restored ${id} after sustained recovery under the negotiated frame budget.`,
  };
}

/**
 * Creates a ladder-backed module adapter ordered from lowest quality to highest quality.
 */
export function createQualityLadderAdapter<Payload>(
  options: QualityLadderAdapterOptions<Payload>
): QualityLadderAdapter<Payload> {
  const id = assertIdentifier("adapter id", options.id);

  if (!Array.isArray(options.levels) || options.levels.length === 0) {
    throw new Error(`Quality ladder adapter "${id}" requires at least one level.`);
  }

  if (options.levels.length > 64) {
    throw new Error(`Quality ladder adapter "${id}" cannot exceed 64 quality levels.`);
  }

  assertUniqueLevelIds(options.levels);

  const authority =
    options.authority === undefined
      ? "visual"
      : assertEnumValue("authority", options.authority, moduleAuthorities);
  const importance =
    options.importance === undefined
      ? "medium"
      : assertEnumValue("importance", options.importance, moduleImportances);
  const domain = assertEnumValue("domain", options.domain, performanceDomains);
  const levels = [...options.levels];
  const metadata = normalizePerformanceBudgetMetadata("budget metadata", options);
  let currentLevelIndex = resolveLevelIndex(levels, options.initialLevel);

  const emitChange = (
    context: PerformanceAdjustmentContext,
    adjustment: PerformanceAdjustmentRecord<Payload>,
    previousLevelIndex: number
  ) => {
    if (typeof options.onLevelChange !== "function") {
      return;
    }

    try {
      options.onLevelChange({
        context,
        previousLevel: levels[previousLevelIndex]!,
        currentLevel: levels[currentLevelIndex]!,
        adjustment,
      });
    } catch {
      // Change notifications must not destabilize the governor.
    }
  };

  const apply = (
    direction: "down" | "up",
    context: PerformanceAdjustmentContext
  ): PerformanceAdjustmentRecord<Payload> | null => {
    const nextLevelIndex =
      direction === "down" ? currentLevelIndex - 1 : currentLevelIndex + 1;

    if (nextLevelIndex < 0 || nextLevelIndex >= levels.length) {
      return null;
    }

    const previousLevelIndex = currentLevelIndex;
    currentLevelIndex = nextLevelIndex;

    const adjustment = buildAdjustment<Payload>(
      direction,
      id,
      domain,
      authority,
      importance,
      previousLevelIndex,
      nextLevelIndex,
      levels,
      context
    );

    emitChange(context, adjustment, previousLevelIndex);
    return adjustment;
  };

  return {
    id,
    domain,
    authority,
    importance,
    representationBand: metadata.representationBand,
    qualityDimensions: metadata.qualityDimensions,
    importanceSignals: metadata.importanceSignals,
    getCurrentLevel() {
      return levels[currentLevelIndex]!;
    },
    getSnapshot() {
      return buildSnapshot(
        id,
        domain,
        authority,
        importance,
        metadata,
        levels,
        currentLevelIndex
      );
    },
    stepDown(context) {
      return apply("down", context);
    },
    stepUp(context) {
      return apply("up", context);
    },
  };
}
