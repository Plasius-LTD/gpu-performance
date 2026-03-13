import { describe, expect, it, vi } from "vitest";

import {
  createDeviceProfile,
  createGpuPerformanceGovernor,
  createQualityLadderAdapter,
} from "../src/index.js";

function createGovernor() {
  const device = createDeviceProfile({
    deviceClass: "desktop",
    mode: "flat",
    refreshRateHz: 60,
  });

  const resolution = createQualityLadderAdapter({
    id: "resolution",
    domain: "resolution",
    levels: [
      { id: "50", config: { scale: 0.5 }, estimatedCostMs: 1.2 },
      { id: "100", config: { scale: 1.0 }, estimatedCostMs: 4.5 },
    ],
  });

  const particles = createQualityLadderAdapter({
    id: "particles",
    domain: "particles",
    levels: [
      { id: "low", config: { maxParticles: 1000 }, estimatedCostMs: 0.5 },
      { id: "high", config: { maxParticles: 7000 }, estimatedCostMs: 2.2 },
    ],
  });

  const physics = createQualityLadderAdapter({
    id: "physics",
    domain: "physics",
    authority: "authoritative",
    importance: "critical",
    levels: [{ id: "fixed", config: { tickHz: 60 }, estimatedCostMs: 2.8 }],
  });

  const onDecision = vi.fn();
  const onError = vi.fn();
  const governor = createGpuPerformanceGovernor({
    device,
    modules: [resolution, particles, physics],
    adaptation: {
      sampleWindowSize: 4,
      minimumSamplesBeforeAdjustment: 4,
      degradeCooldownFrames: 1,
      upgradeCooldownFrames: 1,
      minStableFramesForRecovery: 2,
      maxStepChangesPerCycle: 1,
    },
    telemetry: {
      onDecision,
      onError,
    },
  });

  return { governor, resolution, particles, physics, onDecision, onError };
}

describe("gpu performance governor", () => {
  it("does not react before the minimum sample threshold", () => {
    const { governor } = createGovernor();

    const decisions = [20.1, 19.8, 20.2].map((frameTimeMs) =>
      governor.recordFrame({ frameTimeMs })
    );

    expect(decisions.every((decision) => decision.adjustments.length === 0)).toBe(true);
  });

  it("degrades visual modules before authoritative physics", () => {
    const { governor, resolution, particles, physics } = createGovernor();

    for (const frameTimeMs of [20.1, 19.8, 20.2, 20.4, 20.3]) {
      governor.recordFrame({ frameTimeMs });
    }

    expect(resolution.getSnapshot().currentLevel.id).toBe("50");
    expect(particles.getSnapshot().currentLevel.id).toBe("low");
    expect(physics.getSnapshot().currentLevel.id).toBe("fixed");
  });

  it("recovers the most recently degraded module first", () => {
    const { governor, resolution, particles } = createGovernor();

    for (const frameTimeMs of [20.4, 20.5, 20.3, 20.6, 20.2]) {
      governor.recordFrame({ frameTimeMs });
    }

    expect(resolution.getSnapshot().currentLevel.id).toBe("50");
    expect(particles.getSnapshot().currentLevel.id).toBe("low");

    let recoveredModuleId: string | undefined;

    for (const frameTimeMs of [12.1, 12.0, 11.8, 11.7, 11.6, 11.5]) {
      const decision = governor.recordFrame({ frameTimeMs });
      if (decision.adjustments.length > 0) {
        recoveredModuleId = decision.adjustments[0]?.moduleId;
        break;
      }
    }

    expect(recoveredModuleId).toBe("particles");
    expect(particles.getSnapshot().currentLevel.id).toBe("high");
    expect(resolution.getSnapshot().currentLevel.id).toBe("50");
  });

  it("emits telemetry for each decision and can reset controller state", () => {
    const { governor, onDecision } = createGovernor();

    governor.recordFrame({ frameTimeMs: 16.2 });
    governor.recordFrame({ frameTimeMs: 16.1 });

    expect(onDecision).toHaveBeenCalledTimes(2);

    governor.reset();
    const state = governor.getState();

    expect(state.cycle).toBe(0);
    expect(state.lastDecision).toBeNull();
    expect(state.recentErrors).toEqual([]);
  });

  it("fails fast when WebGPU support is unavailable", () => {
    expect(() =>
      createGpuPerformanceGovernor({
        device: {
          deviceClass: "desktop",
          mode: "flat",
          refreshRateHz: 60,
          supportsWebGpu: false,
        },
      })
    ).toThrow(/WebGPU support is required/);
  });

  it("ignores duplicate frame ids to preserve idempotency", () => {
    const { governor } = createGovernor();

    const first = governor.recordFrame({ frameId: "frame-1", frameTimeMs: 16.8 });
    const duplicate = governor.recordFrame({ frameId: "frame-1", frameTimeMs: 40 });

    expect(first.processed).toBe(true);
    expect(duplicate.processed).toBe(false);
    expect(duplicate.reason).toContain('Ignored duplicate frame sample "frame-1"');
    expect(governor.getState().cycle).toBe(1);
  });

  it("ignores aborted frame samples before processing", () => {
    const { governor } = createGovernor();
    const controller = new AbortController();
    controller.abort();

    const decision = governor.recordFrame({
      frameId: "frame-2",
      frameTimeMs: 16.1,
      signal: controller.signal,
    });

    expect(decision.processed).toBe(false);
    expect(decision.reason).toContain("AbortSignal was already aborted");
    expect(governor.getState().cycle).toBe(0);
  });

  it("isolates module failures and reports structured errors", () => {
    const healthy = createQualityLadderAdapter({
      id: "healthy",
      domain: "resolution",
      levels: [
        { id: "low", config: { scale: 0.5 }, estimatedCostMs: 1 },
        { id: "high", config: { scale: 1.0 }, estimatedCostMs: 3 },
      ],
    });

    const broken = {
      id: "broken",
      domain: "resolution" as const,
      authority: "visual" as const,
      importance: "medium" as const,
      getSnapshot() {
        return {
          id: "broken",
          domain: "resolution" as const,
          authority: "visual" as const,
          importance: "medium" as const,
          currentLevelIndex: 1,
          currentLevel: { id: "high", config: { count: 100 } },
          levelCount: 2,
          isAtMinimum: false,
          isAtMaximum: true,
          estimatedCostMs: 8,
        };
      },
      stepDown() {
        throw new Error("boom");
      },
      stepUp() {
        return null;
      },
    };

    const onError = vi.fn();
    const governor = createGpuPerformanceGovernor({
      device: {
        deviceClass: "desktop",
        mode: "flat",
        refreshRateHz: 60,
      },
      modules: [broken, healthy],
      adaptation: {
        sampleWindowSize: 4,
        minimumSamplesBeforeAdjustment: 4,
        degradeCooldownFrames: 1,
        maxStepChangesPerCycle: 2,
      },
      telemetry: {
        onError,
      },
    });

    for (const frameTimeMs of [20, 20, 20]) {
      governor.recordFrame({ frameTimeMs });
    }

    const decision = governor.recordFrame({ frameTimeMs: 20, frameId: "frame-3" });

    expect(decision.adjustments[0]?.moduleId).toBe("healthy");
    expect(decision.errors[0]?.code).toBe("MODULE_STEP_DOWN_FAILED");
    expect(onError).toHaveBeenCalled();
  });

  it("isolates telemetry callback failures and records them", () => {
    const governor = createGpuPerformanceGovernor({
      device: {
        deviceClass: "desktop",
        mode: "flat",
        refreshRateHz: 60,
      },
      telemetry: {
        onDecision() {
          throw new Error("telemetry offline");
        },
      },
    });

    const decision = governor.recordFrame({ frameTimeMs: 16.4 });

    expect(decision.processed).toBe(true);
    expect(decision.errors[0]?.code).toBe("TELEMETRY_DECISION_HOOK_FAILED");
  });
});
