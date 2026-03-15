import { describe, expect, it, vi } from "vitest";

import { createQualityLadderAdapter } from "../src/index.js";
import type { PerformanceAdjustmentContext } from "../src/index.js";

function createContext(): PerformanceAdjustmentContext {
  return {
    cycle: 1,
    cause: "degrade",
    pressureLevel: "critical",
    metrics: {
      sampleCount: 8,
      fps: 52,
      latestFrameTimeMs: 19.2,
      averageFrameTimeMs: 18.9,
      emaFrameTimeMs: 18.7,
      p95FrameTimeMs: 20.1,
      targetFrameTimeMs: 16.67,
      frameTimeDeltaMs: 2.23,
      trendDeltaMs: 0.8,
      dropRatio: 0.15,
      thermalState: "nominal",
    },
    target: {
      mode: "flat",
      minimumFrameRate: 60,
      targetFrameRate: 60,
      targetFrameTimeMs: 16.67,
      downgradeFrameTimeMs: 17.5,
      upgradeFrameTimeMs: 15.3,
      candidateFrameRates: [120, 90, 72, 60],
      rationale: ["test"],
    },
    workerGraph: null,
  };
}

describe("quality ladder adapter", () => {
  it("defaults to the highest configured quality level", () => {
    const adapter = createQualityLadderAdapter({
      id: "shadows",
      domain: "shadows",
      levels: [
        { id: "off", config: { enabled: false } },
        { id: "soft", config: { enabled: true } },
      ],
    });

    expect(adapter.getSnapshot().currentLevel.id).toBe("soft");
  });

  it("moves between levels and emits change events", () => {
    const onLevelChange = vi.fn();
    const adapter = createQualityLadderAdapter({
      id: "particles",
      domain: "particles",
      levels: [
        { id: "low", config: { maxParticles: 1000 } },
        { id: "high", config: { maxParticles: 5000 } },
      ],
      onLevelChange,
    });

    const adjustment = adapter.stepDown(createContext());

    expect(adjustment?.fromLevelId).toBe("high");
    expect(adjustment?.toLevelId).toBe("low");
    expect(adapter.getCurrentLevel().id).toBe("low");
    expect(onLevelChange).toHaveBeenCalledTimes(1);
  });

  it("rejects duplicate level identifiers", () => {
    expect(() =>
      createQualityLadderAdapter({
        id: "bad",
        domain: "custom",
        levels: [
          { id: "same", config: { quality: 1 } },
          { id: "same", config: { quality: 2 } },
        ],
      })
    ).toThrow(/Duplicate ladder level id/);
  });

  it("rejects invalid adapter identifiers", () => {
    expect(() =>
      createQualityLadderAdapter({
        id: "bad id",
        domain: "custom",
        levels: [{ id: "low", config: {} }],
      })
    ).toThrow(/adapter id must match/);
  });

  it("isolates errors thrown by onLevelChange callbacks", () => {
    const adapter = createQualityLadderAdapter({
      id: "lighting",
      domain: "lighting",
      levels: [
        { id: "low", config: { samples: 1 } },
        { id: "high", config: { samples: 8 } },
      ],
      onLevelChange() {
        throw new Error("observer failed");
      },
    });

    expect(() => adapter.stepDown(createContext())).not.toThrow();
    expect(adapter.getCurrentLevel().id).toBe("low");
  });
});
