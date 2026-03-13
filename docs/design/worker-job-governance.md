# Worker-Job Governance

## Objective

Shift adaptive control for `@plasius/gpu-*` packages toward a common
worker-job-first pattern:

- packages describe discrete GPU jobs,
- `@plasius/gpu-worker` schedules those jobs,
- `@plasius/gpu-performance` adjusts job budgets based on sustained pressure,
- `@plasius/gpu-debug` exposes opt-in instrumentation over the same flow.

## Package Roles

- `@plasius/gpu-worker`: shared execution plane for discrete GPU work units.
- `@plasius/gpu-performance`: frame-target negotiation, pressure
  classification, and worker-budget actuation.
- `@plasius/gpu-debug`: local debug counters and inferred utilization hints.
- effect packages such as lighting, particles, cloth, fluids, post-processing,
  voxel generation: define job manifests and translate budget levels into worker
  scheduling parameters.

## Budget Shape

Each package-owned worker job should expose levels with:

- `maxDispatchesPerFrame`
- `maxJobsPerDispatch`
- `cadenceDivisor`
- `workgroupScale`
- `maxQueueDepth` when queue pressure must be bounded

This keeps the public surface stable even as new effect packages appear.

## Adaptation Policy

1. Negotiate the target frame profile for the current device.
2. Measure sustained pressure from rolling frame metrics.
3. Degrade worker-job budgets for visual and non-authoritative systems first.
4. Recover in reverse order with longer cooldowns.
5. Leave authoritative gameplay jobs fixed unless a caller opts in explicitly.

## Integration Contract

Each future `@plasius/gpu-*` compute package should provide:

- stable job labels aligned with `@plasius/gpu-worker`,
- one or more worker budget ladders consumable by `@plasius/gpu-performance`,
- optional debug event emission points consumable by `@plasius/gpu-debug`,
- package-local translation from selected budget level to actual dispatch logic.

When a package emits those ladders as manifest data, callers should prefer
`createWorkerJobBudgetAdaptersFromManifest(...)` over rebuilding the adapter
definitions manually. This keeps early adopters such as `gpu-lighting` and
`gpu-particles` aligned on one integration path.

## Observability Notes

Portable WebGPU does not guarantee direct access to total GPU memory or core
count. `@plasius/gpu-debug` therefore reports tracked allocations, dispatch
counts, queue depths, estimated invocations, and optional host-supplied hardware
hints instead of claiming unavailable counters as authoritative.
