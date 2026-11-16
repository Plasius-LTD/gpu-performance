import type { PerformanceAdjustmentContext, QualityRecoveryBudgetOptions } from "./types.js";
import { readNonNegativeNumber, readPositiveNumber } from "./validation.js";

/** Bounded paired measurements; the existing governor still owns all decisions. */
export function createMeasuredQualityRecovery(
  levelCount: number,
  options: QualityRecoveryBudgetOptions | undefined
) {
  const enabled = options !== undefined;
  const headroom = enabled ? readPositiveNumber("recoveryBudget.headroomRatio", options?.headroomRatio) : 1;
  if (headroom === undefined || headroom > 1) {
    throw new Error("recoveryBudget.headroomRatio must be in (0, 1].");
  }
  const initialRatios = options?.initialCostRatios;
  if (initialRatios !== undefined && (!Array.isArray(initialRatios) ||
      initialRatios.length !== levelCount - 1 ||
      Array.from(initialRatios).some(value => typeof value !== 'number' || !Number.isFinite(value) || value <= 0))) {
    throw new Error('recoveryBudget.initialCostRatios must contain one finite positive ratio per upward step.');
  }
  const lastTimes: Array<number | undefined> = new Array(levelCount);
  const recoveryRatios: Array<number | undefined> = initialRatios ? [...initialRatios] : new Array(levelCount);
  let pending: { index: number; upperTime: number } | undefined;

  return {
    record(index: number, frameTimeMs: number) {
      const value = readNonNegativeNumber("frameTimeMs", frameTimeMs);
      if (value === undefined) throw new Error("frameTimeMs is required.");
      if (!enabled || value === 0) return;
      lastTimes[index] = value;
      if (pending?.index === index) {
        // Keep this paired ratio fixed until another downgrade. Updating its
        // denominator forever would erase evidence of genuine engine speedups.
        recoveryRatios[index] = pending.upperTime / value;
        pending = undefined;
      }
    },
    reduced(from: number, to: number) {
      const upperTime = lastTimes[from];
      pending = enabled && upperTime !== undefined ? { index: to, upperTime } : undefined;
    },
    canRecover(index: number, context: PerformanceAdjustmentContext) {
      const ratio = recoveryRatios[index];
      return !enabled || ratio === undefined ||
        context.metrics.latestFrameTimeMs * ratio <= context.target.targetFrameTimeMs * headroom;
    },
  };
}
