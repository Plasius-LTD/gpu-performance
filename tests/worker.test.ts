import { describe, expect, it } from "vitest";

import {
  createDeviceProfile,
  createGpuPerformanceGovernor,
  createWorkerJobBudgetAdapter,
} from "../src/index.js";

describe("worker job budget adapter", () => {
  it("exposes worker job metadata and current budget", () => {
    const adapter = createWorkerJobBudgetAdapter({
      id: "fluid-solver",
      jobType: "fluid.solve",
      queueClass: "simulation",
      domain: "custom",
      levels: [
        {
          id: "low",
          config: {
            maxDispatchesPerFrame: 1,
            maxJobsPerDispatch: 64,
            cadenceDivisor: 2,
            workgroupScale: 0.5,
            maxQueueDepth: 128,
          },
        },
        {
          id: "high",
          config: {
            maxDispatchesPerFrame: 2,
            maxJobsPerDispatch: 256,
            cadenceDivisor: 1,
            workgroupScale: 1,
            maxQueueDepth: 512,
          },
        },
      ],
    });

    expect(adapter.jobType).toBe("fluid.solve");
    expect(adapter.queueClass).toBe("simulation");
    expect(adapter.getBudget().maxJobsPerDispatch).toBe(256);
    expect(adapter.getWorkerSnapshot().jobType).toBe("fluid.solve");
  });

  it("rejects invalid worker budget config", () => {
    expect(() =>
      createWorkerJobBudgetAdapter({
        id: "bad-worker-budget",
        jobType: "bad.job",
        levels: [
          {
            id: "invalid",
            config: {
              maxDispatchesPerFrame: 1,
              maxJobsPerDispatch: 32,
              workgroupScale: 1.5,
            },
          },
        ],
      })
    ).toThrow(/workgroupScale must be less than or equal to 1/);
  });

  it("can be governed like any other module while preserving authoritative jobs", () => {
    const device = createDeviceProfile({
      deviceClass: "desktop",
      mode: "flat",
      refreshRateHz: 60,
    });

    const post = createWorkerJobBudgetAdapter({
      id: "post",
      jobType: "post.process",
      queueClass: "post-processing",
      domain: "post-processing",
      levels: [
        {
          id: "low",
          config: {
            maxDispatchesPerFrame: 1,
            maxJobsPerDispatch: 16,
            cadenceDivisor: 2,
            workgroupScale: 0.5,
          },
          estimatedCostMs: 0.8,
        },
        {
          id: "high",
          config: {
            maxDispatchesPerFrame: 2,
            maxJobsPerDispatch: 64,
            cadenceDivisor: 1,
            workgroupScale: 1,
          },
          estimatedCostMs: 2.4,
        },
      ],
    });

    const physics = createWorkerJobBudgetAdapter({
      id: "physics",
      jobType: "physics.integrate",
      queueClass: "simulation",
      domain: "physics",
      authority: "authoritative",
      importance: "critical",
      levels: [
        {
          id: "fixed",
          config: {
            maxDispatchesPerFrame: 1,
            maxJobsPerDispatch: 64,
            cadenceDivisor: 1,
            workgroupScale: 1,
          },
          estimatedCostMs: 3.2,
        },
      ],
    });

    const governor = createGpuPerformanceGovernor({
      device,
      modules: [post, physics],
      adaptation: {
        sampleWindowSize: 4,
        minimumSamplesBeforeAdjustment: 4,
        degradeCooldownFrames: 1,
        maxStepChangesPerCycle: 1,
      },
    });

    for (const frameTimeMs of [20.1, 20.3, 20.2, 20.4, 20.1]) {
      governor.recordFrame({ frameTimeMs });
    }

    expect(post.getBudget().maxJobsPerDispatch).toBe(16);
    expect(physics.getBudget().maxJobsPerDispatch).toBe(64);
  });
});
