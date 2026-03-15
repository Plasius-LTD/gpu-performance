import { describe, expect, it } from "vitest";

import {
  createDeviceProfile,
  createGpuPerformanceGovernor,
  createQualityLadderAdapter,
  createWorkerJobBudgetAdaptersFromManifest,
  createWorkerJobBudgetManifestGraph,
  rayTracingQualityDimensions,
  representationBands,
} from "../src/index.js";

function createPressureGovernor(modules: Parameters<typeof createGpuPerformanceGovernor>[0]["modules"]) {
  return createGpuPerformanceGovernor({
    device: createDeviceProfile({
      deviceClass: "desktop",
      mode: "flat",
      refreshRateHz: 60,
    }),
    modules,
    adaptation: {
      sampleWindowSize: 4,
      minimumSamplesBeforeAdjustment: 4,
      degradeCooldownFrames: 1,
      upgradeCooldownFrames: 1,
      maxStepChangesPerCycle: 1,
    },
  });
}

function applyPressure(governor: ReturnType<typeof createGpuPerformanceGovernor>) {
  for (const frameTimeMs of [20.2, 20.1, 20.4]) {
    governor.recordFrame({ frameTimeMs });
  }

  return governor.recordFrame({ frameTimeMs: 20.3, frameId: `frame-${Math.random()}` });
}

describe("ray-tracing-first budget contract", () => {
  it("describes explicit quality dimensions without flattening them into one scalar", () => {
    const adapter = createQualityLadderAdapter({
      id: "rt-near-lighting",
      domain: "lighting",
      representationBand: "near",
      qualityDimensions: {
        geometry: 0.2,
        shadows: 1,
        rayTracing: 1,
        lightingSamples: 0.8,
        temporalReuse: 0.3,
      },
      importanceSignals: {
        visible: true,
        playerRelevant: true,
        shadowSignificance: "critical",
      },
      levels: [
        {
          id: "reduced",
          config: { samples: 1 },
          estimatedCostMs: 1.1,
        },
        {
          id: "full",
          config: { samples: 4 },
          estimatedCostMs: 3.7,
        },
      ],
    });

    expect(rayTracingQualityDimensions).toEqual([
      "geometry",
      "animation",
      "deformation",
      "shading",
      "shadows",
      "rayTracing",
      "lightingSamples",
      "updateCadence",
      "temporalReuse",
    ]);
    expect(adapter.getSnapshot()).toMatchObject({
      representationBand: "near",
      qualityDimensions: {
        geometry: 0.2,
        shadows: 1,
        rayTracing: 1,
        lightingSamples: 0.8,
        temporalReuse: 0.3,
      },
      importanceSignals: {
        visible: true,
        playerRelevant: true,
        shadowSignificance: "critical",
      },
    });
  });

  it("preserves representation tiers through manifest graphing and adapter normalization", () => {
    const manifest = {
      schedulerMode: "dag" as const,
      jobs: [
        {
          label: "renderer.near.rtDirectLighting",
          worker: {
            jobType: "renderer.near.rtDirectLighting",
            queueClass: "lighting" as const,
            priority: 4,
            dependencies: [],
            schedulerMode: "dag" as const,
          },
          performance: {
            id: "renderer.near.rtDirectLighting",
            domain: "lighting" as const,
            representationBand: "near" as const,
            qualityDimensions: {
              shadows: 1,
              rayTracing: 1,
              lightingSamples: 0.8,
            },
            levels: [
              {
                id: "low",
                config: {
                  maxDispatchesPerFrame: 1,
                  maxJobsPerDispatch: 8,
                },
              },
            ],
          },
        },
        {
          label: "renderer.far.proxyLight",
          worker: {
            jobType: "renderer.far.proxyLight",
            queueClass: "lighting" as const,
            priority: 1,
            dependencies: ["renderer.near.rtDirectLighting"],
            schedulerMode: "dag" as const,
          },
          performance: {
            id: "renderer.far.proxyLight",
            domain: "lighting" as const,
            representationBand: "far" as const,
            qualityDimensions: {
              updateCadence: 1,
              temporalReuse: 1,
            },
            levels: [
              {
                id: "low",
                config: {
                  maxDispatchesPerFrame: 1,
                  maxJobsPerDispatch: 4,
                },
              },
            ],
          },
        },
      ],
    };

    const graph = createWorkerJobBudgetManifestGraph(manifest);
    const adapters = createWorkerJobBudgetAdaptersFromManifest(manifest);

    expect(representationBands).toEqual(["near", "mid", "far", "horizon"]);
    expect(graph.representationBands).toEqual(["near", "far"]);
    expect(graph.jobs.find((job) => job.id === "renderer.near.rtDirectLighting"))
      .toMatchObject({
        representationBand: "near",
        qualityDimensions: {
          shadows: 1,
          rayTracing: 1,
          lightingSamples: 0.8,
        },
      });
    expect(adapters.map((adapter) => adapter.getSnapshot().representationBand)).toEqual([
      "near",
      "far",
    ]);
  });

  it("keeps authoritative jobs protected while degrading visual and non-authoritative work first", () => {
    const visual = createQualityLadderAdapter({
      id: "far-reflections",
      domain: "reflections",
      representationBand: "far",
      qualityDimensions: {
        rayTracing: 1,
        updateCadence: 1,
        temporalReuse: 1,
      },
      levels: [
        { id: "reduced", config: { quality: "reduced" }, estimatedCostMs: 0.9 },
        { id: "full", config: { quality: "full" }, estimatedCostMs: 2.8 },
      ],
    });

    const physics = createQualityLadderAdapter({
      id: "physics",
      domain: "physics",
      authority: "authoritative",
      importance: "critical",
      levels: [{ id: "fixed", config: { tickHz: 60 }, estimatedCostMs: 3 }],
    });

    const governor = createPressureGovernor([visual, physics]);
    applyPressure(governor);

    expect(visual.getSnapshot().currentLevel.id).toBe("reduced");
    expect(physics.getSnapshot().currentLevel.id).toBe("fixed");
  });
});

describe("ray-tracing-first governor unit planning", () => {
  it("ranks near-field work ahead of distant proxy work when choosing downgrade candidates", () => {
    const near = createQualityLadderAdapter({
      id: "near-geometry",
      domain: "geometry",
      representationBand: "near",
      qualityDimensions: { geometry: 1 },
      importanceSignals: {
        visible: true,
        playerRelevant: true,
        imageCritical: true,
      },
      levels: [
        { id: "low", config: { lod: 1 }, estimatedCostMs: 1.2 },
        { id: "high", config: { lod: 0 }, estimatedCostMs: 3.5 },
      ],
    });
    const far = createQualityLadderAdapter({
      id: "far-proxy",
      domain: "geometry",
      representationBand: "far",
      qualityDimensions: { updateCadence: 1, temporalReuse: 1 },
      levels: [
        { id: "low", config: { cadence: 8 }, estimatedCostMs: 0.7 },
        { id: "high", config: { cadence: 1 }, estimatedCostMs: 2.4 },
      ],
    });

    const governor = createPressureGovernor([near, far]);
    const decision = applyPressure(governor);

    expect(decision.adjustments[0]?.moduleId).toBe("far-proxy");
    expect(far.getSnapshot().currentLevel.id).toBe("low");
    expect(near.getSnapshot().currentLevel.id).toBe("high");
  });

  it("scales temporal reuse and update cadence independently from geometry fidelity", () => {
    const temporalReuse = createQualityLadderAdapter({
      id: "temporal-history",
      domain: "lighting",
      representationBand: "mid",
      qualityDimensions: {
        temporalReuse: 1,
        updateCadence: 1,
      },
      levels: [
        { id: "reduced", config: { cadence: 2, history: 2 }, estimatedCostMs: 0.8 },
        { id: "full", config: { cadence: 1, history: 8 }, estimatedCostMs: 2.1 },
      ],
    });
    const geometry = createQualityLadderAdapter({
      id: "mid-geometry",
      domain: "geometry",
      representationBand: "mid",
      qualityDimensions: {
        geometry: 1,
      },
      importanceSignals: {
        visible: true,
      },
      levels: [
        { id: "low", config: { lod: 2 }, estimatedCostMs: 1.4 },
        { id: "high", config: { lod: 0 }, estimatedCostMs: 3.1 },
      ],
    });

    const governor = createPressureGovernor([temporalReuse, geometry]);
    const decision = applyPressure(governor);

    expect(decision.adjustments[0]?.moduleId).toBe("temporal-history");
    expect(temporalReuse.getSnapshot().currentLevel.id).toBe("reduced");
    expect(geometry.getSnapshot().currentLevel.id).toBe("high");
  });

  it("accounts for ray-tracing fidelity separately from raster-facing geometry fidelity", () => {
    const rayTracing = createQualityLadderAdapter({
      id: "near-rt-reflections",
      domain: "reflections",
      representationBand: "near",
      qualityDimensions: {
        rayTracing: 1,
        lightingSamples: 0.7,
      },
      importanceSignals: {
        visible: true,
        reflectionSignificance: "high",
      },
      levels: [
        { id: "reduced", config: { raysPerPixel: 1 }, estimatedCostMs: 1.3 },
        { id: "full", config: { raysPerPixel: 4 }, estimatedCostMs: 3.4 },
      ],
    });
    const geometry = createQualityLadderAdapter({
      id: "near-raster-geometry",
      domain: "geometry",
      representationBand: "near",
      qualityDimensions: {
        geometry: 1,
      },
      importanceSignals: {
        visible: true,
        playerRelevant: true,
      },
      levels: [
        { id: "low", config: { lod: 1 }, estimatedCostMs: 1.4 },
        { id: "high", config: { lod: 0 }, estimatedCostMs: 3.2 },
      ],
    });

    const governor = createPressureGovernor([rayTracing, geometry]);
    const decision = applyPressure(governor);

    expect(decision.adjustments[0]?.moduleId).toBe("near-rt-reflections");
    expect(rayTracing.getSnapshot().currentLevel.id).toBe("reduced");
    expect(geometry.getSnapshot().currentLevel.id).toBe("high");
  });
});
