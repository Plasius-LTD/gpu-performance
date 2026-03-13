import { describe, expect, it } from "vitest";

import {
  createDeviceProfile,
  createGpuPerformanceGovernor,
  createWorkerJobBudgetAdapter,
  createWorkerJobBudgetAdaptersFromManifest,
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

  it("creates worker budget adapters directly from consumer manifests", () => {
    const manifest = {
      schemaVersion: 1,
      owner: "lighting",
      jobs: [
        {
          key: "direct-lighting",
          label: "lighting.direct",
          worker: {
            jobType: "lighting.direct",
            queueClass: "lighting" as const,
          },
          performance: {
            id: "lighting.direct",
            domain: "lighting" as const,
            authority: "visual" as const,
            importance: "high" as const,
            levels: [
              {
                id: "low",
                config: {
                  maxDispatchesPerFrame: 1,
                  maxJobsPerDispatch: 16,
                  cadenceDivisor: 2,
                  workgroupScale: 0.5,
                },
              },
              {
                id: "high",
                config: {
                  maxDispatchesPerFrame: 2,
                  maxJobsPerDispatch: 64,
                  cadenceDivisor: 1,
                  workgroupScale: 1,
                },
              },
            ],
          },
        },
        {
          key: "shadow-trace",
          label: "lighting.shadowTrace",
          worker: {
            jobType: "lighting.shadowTrace",
            queueClass: "lighting" as const,
          },
          performance: {
            id: "lighting.shadowTrace",
            jobType: "lighting.shadowTrace",
            queueClass: "lighting" as const,
            domain: "shadows" as const,
            authority: "visual" as const,
            importance: "medium" as const,
            levels: [
              {
                id: "reduced",
                config: {
                  maxDispatchesPerFrame: 1,
                  maxJobsPerDispatch: 8,
                  cadenceDivisor: 2,
                  workgroupScale: 0.5,
                },
              },
              {
                id: "full",
                config: {
                  maxDispatchesPerFrame: 1,
                  maxJobsPerDispatch: 24,
                  cadenceDivisor: 1,
                  workgroupScale: 1,
                },
              },
            ],
          },
        },
      ],
    };

    const seen: string[] = [];
    const adapters = createWorkerJobBudgetAdaptersFromManifest(manifest, {
      initialLevels: {
        "lighting.direct": "low",
      },
      selectJob(job) {
        return job.key !== "shadow-trace";
      },
      onLevelChange(job, event) {
        seen.push(`${job.key}:${event.adjustment.toLevelId}`);
      },
    });

    expect(adapters).toHaveLength(1);
    const [adapter] = adapters;
    expect(adapter).toBeDefined();
    expect(adapter!.jobType).toBe("lighting.direct");
    expect(adapter!.queueClass).toBe("lighting");
    expect(adapter!.getBudget().maxJobsPerDispatch).toBe(16);

    adapter!.stepUp({
      cycle: 1,
      cause: "recover",
      pressureLevel: "recovering",
      metrics: {
        sampleCount: 4,
        fps: 72,
        latestFrameTimeMs: 12,
        averageFrameTimeMs: 12,
        emaFrameTimeMs: 12,
        p95FrameTimeMs: 12,
        targetFrameTimeMs: 13.8,
        frameTimeDeltaMs: -1.8,
        trendDeltaMs: -0.5,
        dropRatio: 0,
        thermalState: "nominal",
      },
      target: {
        mode: "immersive-vr",
        minimumFrameRate: 72,
        targetFrameRate: 72,
        targetFrameTimeMs: 13.8,
        downgradeFrameTimeMs: 14.4,
        upgradeFrameTimeMs: 13,
        candidateFrameRates: [72],
        rationale: [],
      },
    });

    expect(seen).toEqual(["direct-lighting:high"]);
  });

  it("rejects manifests that do not expose worker job metadata", () => {
    expect(() =>
      createWorkerJobBudgetAdaptersFromManifest({
        jobs: [
          {
            performance: {
              id: "missing-worker-metadata",
              levels: [
                {
                  id: "only",
                  config: {
                    maxDispatchesPerFrame: 1,
                    maxJobsPerDispatch: 8,
                  },
                },
              ],
            },
          },
        ],
      })
    ).toThrow(/must provide performance\.jobType or worker\.jobType/);
  });
});
