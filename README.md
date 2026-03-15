# @plasius/gpu-performance

[![npm version](https://img.shields.io/npm/v/@plasius/gpu-performance.svg)](https://www.npmjs.com/package/@plasius/gpu-performance)
[![Build Status](https://img.shields.io/github/actions/workflow/status/Plasius-LTD/gpu-performance/ci.yml?branch=main&label=build&style=flat)](https://github.com/Plasius-LTD/gpu-performance/actions/workflows/ci.yml)
[![coverage](https://img.shields.io/codecov/c/github/Plasius-LTD/gpu-performance)](https://codecov.io/gh/Plasius-LTD/gpu-performance)
[![License](https://img.shields.io/github/license/Plasius-LTD/gpu-performance)](./LICENSE)
[![Code of Conduct](https://img.shields.io/badge/code%20of%20conduct-yes-blue.svg)](./CODE_OF_CONDUCT.md)
[![Security Policy](https://img.shields.io/badge/security%20policy-yes-orange.svg)](./SECURITY.md)
[![Changelog](https://img.shields.io/badge/changelog-md-blue.svg)](./CHANGELOG.md)

Device-negotiated GPU performance governance for Plasius rendering stacks.
The package tracks frame-budget trends, negotiates per-device targets, and
orchestrates quality ladders across rendering modules without taking ownership
of renderer internals.

Apache-2.0. ESM + CJS builds. TypeScript types included.

## Install

```bash
npm install @plasius/gpu-performance
```

## What It Solves

- Negotiates frame targets by device mode and refresh characteristics.
- Watches sustained performance trends instead of reacting to one noisy frame.
- Degrades visual and non-authoritative simulation quality before gameplay-safe
  physics.
- Coordinates quality ladders for renderer, lighting, particles, cloth, XR, and
  other GPU-heavy systems through adapter contracts.
- Keeps control local to the runtime while exposing telemetry hooks that callers
  can route through `@plasius/analytics` for shared analytics transport,
  batching, and persistence.
- Enforces fail-fast validation, bounded histories, and structured error records
  to satisfy the package NFR baseline.

## Usage

```ts
import {
  createDeviceProfile,
  createGpuPerformanceGovernor,
  createQualityLadderAdapter,
  createWorkerJobBudgetAdapter,
  rayTracingQualityDimensions,
  representationBands,
} from "@plasius/gpu-performance";

const device = createDeviceProfile({
  deviceClass: "xr-headset",
  mode: "immersive-vr",
  refreshRateHz: 72,
  supportedFrameRates: [72, 90],
  supportsFoveation: true,
});

const renderScale = createQualityLadderAdapter({
  id: "render-scale",
  domain: "resolution",
  levels: [
    { id: "50", config: { scale: 0.5 }, estimatedCostMs: 1.2 },
    { id: "67", config: { scale: 0.67 }, estimatedCostMs: 2.1 },
    { id: "80", config: { scale: 0.8 }, estimatedCostMs: 3.3 },
    { id: "100", config: { scale: 1.0 }, estimatedCostMs: 5.4 },
  ],
  initialLevel: "100",
  onLevelChange: ({ adjustment }) => {
    console.log("render-scale change", adjustment.toLevelId);
  },
});

const cloth = createQualityLadderAdapter({
  id: "cloth",
  domain: "cloth",
  authority: "non-authoritative-simulation",
  levels: [
    { id: "off", config: { enabled: false, solverIterations: 0 }, estimatedCostMs: 0 },
    { id: "low", config: { enabled: true, solverIterations: 2 }, estimatedCostMs: 0.8 },
    { id: "high", config: { enabled: true, solverIterations: 5 }, estimatedCostMs: 2.2 },
  ],
  initialLevel: "high",
});

const physics = createQualityLadderAdapter({
  id: "physics",
  domain: "physics",
  authority: "authoritative",
  importance: "critical",
  levels: [
    { id: "fixed", config: { tickHz: 60 }, estimatedCostMs: 2.8 },
  ],
});

const reflections = createQualityLadderAdapter({
  id: "reflections",
  domain: "reflections",
  representationBand: "far",
  qualityDimensions: {
    rayTracing: 1,
    updateCadence: 1,
    temporalReuse: 1,
  },
  importanceSignals: {
    visible: false,
    reflectionSignificance: "medium",
  },
  levels: [
    { id: "reduced", config: { raysPerPixel: 1 }, estimatedCostMs: 0.8 },
    { id: "full", config: { raysPerPixel: 4 }, estimatedCostMs: 2.1 },
  ],
});

const governor = createGpuPerformanceGovernor({
  device,
  modules: [renderScale, cloth, reflections, physics],
});

for (const [index, frameTimeMs] of [12.8, 13.1, 18.4, 18.9, 19.2, 18.8, 18.1, 17.9].entries()) {
  const decision = governor.recordFrame({
    frameId: `frame-${index}`,
    frameTimeMs,
  });
  if (decision.adjustments.length > 0) {
    console.log(decision.reason, decision.adjustments);
  }
}
```

Ray-tracing-first budget metadata is part of the public contract:

- `representationBands`: `near`, `mid`, `far`, `horizon`
- `rayTracingQualityDimensions`:
  - `geometry`
  - `animation`
  - `deformation`
  - `shading`
  - `shadows`
  - `rayTracing`
  - `lightingSamples`
  - `updateCadence`
  - `temporalReuse`

That lets modules preserve representation tiers and degrade cheaper cadence,
history, and RT-fidelity controls before more expensive geometry or
authoritative work.

## Worker-Job Governance

For `@plasius/gpu-*` packages that schedule work through `@plasius/gpu-worker`,
prefer adapting worker job budgets instead of inventing package-local control
loops.

```ts
import {
  createDeviceProfile,
  createGpuPerformanceGovernor,
  createWorkerJobBudgetAdapter,
  createWorkerJobBudgetManifestGraph,
  createWorkerJobBudgetAdaptersFromManifest,
} from "@plasius/gpu-performance";

const device = createDeviceProfile({
  deviceClass: "desktop",
  mode: "flat",
  refreshRateHz: 144,
});

const postProcessingJobs = createWorkerJobBudgetAdapter({
  id: "post-processing",
  jobType: "post.process",
  queueClass: "post-processing",
  domain: "post-processing",
  levels: [
    {
      id: "reduced",
      config: {
        maxDispatchesPerFrame: 1,
        maxJobsPerDispatch: 32,
        cadenceDivisor: 2,
        workgroupScale: 0.5,
      },
      estimatedCostMs: 0.9,
    },
    {
      id: "full",
      config: {
        maxDispatchesPerFrame: 2,
        maxJobsPerDispatch: 128,
        cadenceDivisor: 1,
        workgroupScale: 1,
      },
      estimatedCostMs: 2.8,
    },
  ],
});

const governor = createGpuPerformanceGovernor({
  device,
  modules: [postProcessingJobs],
});

const decision = governor.recordFrame({ frameTimeMs: 19.2 });
console.log(decision.adjustments, postProcessingJobs.getBudget());
```

If an adopting package already exposes worker manifests, convert those manifests
directly into adapters instead of rebuilding the same ladders by hand.

```ts
import { createWorkerJobBudgetAdaptersFromManifest } from "@plasius/gpu-performance";
import { getLightingTechniqueWorkerManifest } from "@plasius/gpu-lighting";

const manifest = getLightingTechniqueWorkerManifest("hybrid");
const graph = createWorkerJobBudgetManifestGraph(manifest);
const adapters = createWorkerJobBudgetAdaptersFromManifest(manifest, {
  initialLevels: {
    "lighting.direct": "medium",
  },
  selectJob(job) {
    return job.performance.importance !== "critical";
  },
});

const governor = createGpuPerformanceGovernor({
  device,
  modules: adapters,
});

console.log(graph.roots);
console.log(graph.priorityLanes);
```

Manifest-driven adapters now preserve scheduler metadata from the source
package:

- `schedulerMode`: `flat` or `dag`
- `priority`: non-negative ready-queue priority
- `dependencies`: upstream job labels that must complete before a job becomes
  runnable
- `dependents`: downstream job labels unlocked by completion
- `root`: whether a job starts runnable

If callers need the manifest normalized into an explicit multi-root DAG before
adapting budgets, use `createWorkerJobBudgetManifestGraph(...)`. The helper
derives:

- `jobIds`
- `roots`
- `topologicalOrder`
- `priorityLanes`
- per-job dependency and dependent counts

That means consumers can reuse DAG-aware manifests from packages such as
`@plasius/gpu-lighting`, `@plasius/gpu-particles`, and `@plasius/gpu-physics`
without rebuilding dependency metadata by hand.

When those adapters are registered with the governor, DAG metadata is no longer
debug-only. The governor now:

- emits `decision.workerGraph` and `getState().workerGraph` summaries for local
  observability,
- protects DAG roots, high-priority jobs, and high fan-out jobs from being
  degraded before lower-value leaf work,
- keeps that graph reasoning local to the governor without taking ownership of
  queue execution internals.

## API

- `createDeviceProfile(input)`
- `negotiateFrameTarget(options)`
- `createQualityLadderAdapter(options)`
- `representationBands`
- `rayTracingQualityDimensions`
- `motionClasses`
- `createWorkerJobBudgetAdapter(options)`
- `createWorkerJobBudgetManifestGraph(manifest)`
- `createWorkerJobBudgetAdaptersFromManifest(manifest, options?)`
- `createGpuPerformanceGovernor(options)`
- `createPerformanceGovernor(options)` alias

## Operational Guarantees

- Invalid configuration fails fast instead of being silently coerced.
- Duplicate `frameId` values are ignored for idempotent frame ingestion.
- Aborted frame samples are ignored before processing.
- Module and telemetry failures are isolated into structured error records so
  one broken integration does not cascade into the rest of the runtime.

## Analytics Integration

`@plasius/gpu-performance` does not ship its own analytics client. If governor
events need to be exported beyond local debugging, route them through
`@plasius/analytics`.

```ts
import { createFrontendAnalyticsClient } from "@plasius/analytics";
import { createGpuPerformanceGovernor } from "@plasius/gpu-performance";

const analytics = createFrontendAnalyticsClient({
  source: "gpu-performance",
  endpoint: "https://analytics.example.com/collect",
});

const governor = createGpuPerformanceGovernor({
  device,
  modules,
  telemetry: {
    onDecision(decision) {
      if (decision.adjustments.length === 0) {
        return;
      }

      analytics.track({
        component: "GpuPerformanceGovernor",
        action: "quality_adjustment",
        label: decision.pressureLevel,
        context: {
          cycle: decision.cycle,
          targetFrameTimeMs: decision.metrics.targetFrameTimeMs,
          averageFrameTimeMs: decision.metrics.averageFrameTimeMs,
          dagRootCount: decision.workerGraph?.rootCount ?? 0,
          dagMaxPriority: decision.workerGraph?.maxPriority ?? 0,
          modules: decision.adjustments.map((adjustment) => adjustment.moduleId),
        },
      });
    },
  },
});
```

## Design Principles

- WebGPU-first. Non-WebGPU platforms remain unsupported.
- Device-specific frame targets rather than a single global FPS constant.
- Trend-aware adaptation with hysteresis and cooldowns.
- Visual quality is flexible; gameplay-authoritative simulation stays fixed by
  default.
- Renderer integration happens through adapters, not hidden coupling.
- Worker-job budgets are the preferred actuation surface for current and future
  `@plasius/gpu-*` compute packages.
- Worker manifests may carry DAG scheduling metadata so the governor can reason
  about ordered worker stages without owning queue internals.
- Analytics export goes through `@plasius/analytics`; this package only emits
  local lifecycle hooks.

## Demo

Run the console demo locally:

```bash
npm run demo
```

See [demo/README.md](./demo/README.md) for details.

## Development Checks

```bash
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npm run pack:check
```

## Release Automation

GitHub Actions now carries the package delivery path:

- CI runs on pushes and pull requests to enforce lint, typecheck, audit, build,
  coverage, and package verification.
- CD publishes to npm only through the manual GitHub workflow.
- A scheduled workflow opens monthly npm audit-fix pull requests.

## Files

- `src/device.ts`: device profile normalization and frame-target negotiation.
- `src/ladder.ts`: generic quality ladder adapters for GPU-facing modules.
- `src/governor.ts`: trend-aware control loop and module orchestration.
- `src/worker.ts`: worker-job budget adapters and consumer-manifest helpers.
- `src/validation.ts`: shared runtime input validation helpers.
- `src/worker.ts`: worker-job budget adapters for `@plasius/gpu-worker`
  integrations.
- `tests/*.test.ts`: unit coverage for negotiation, adaptation, and recovery.
- `docs/adrs/*`: architecture decisions for package scope and control policy.
- `docs/tdrs/*`: implementation records for the control loop and adapter model.
- `docs/design/*`: design detail for rollout and integrations.
