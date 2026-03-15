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

When a package schedules through a DAG-ready queue, the manifest should also
publish:

- `schedulerMode`
- `priority`
- `dependencies`
- stable labels that act as DAG node ids

Those values stay package-owned so the governor can preserve ordering metadata
without taking ownership of queue internals.

`createWorkerJobBudgetManifestGraph(...)` is the normalization step for that
data. It derives:

- roots for initial runnable work
- downstream `dependents`
- `priorityLanes` for ready-queue planning
- stable topological order for validation and tooling

## Adaptation Policy

1. Negotiate the target frame profile for the current device.
2. Measure sustained pressure from rolling frame metrics.
3. Degrade worker-job budgets for visual and non-authoritative systems first.
   Within DAG workloads, prefer leaf, low-priority, low-fan-out jobs before
   roots or jobs that unlock substantial downstream work.
4. Recover in reverse order with longer cooldowns.
5. Leave authoritative gameplay jobs fixed unless a caller opts in explicitly.

## Integration Contract

Each future `@plasius/gpu-*` compute package should provide:

- stable job labels aligned with `@plasius/gpu-worker`,
- one or more worker budget ladders consumable by `@plasius/gpu-performance`,
- DAG scheduler metadata when jobs depend on one another,
- optional debug event emission points consumable by `@plasius/gpu-debug`,
- package-local translation from selected budget level to actual dispatch logic.

When a package emits those ladders as manifest data, callers should prefer
`createWorkerJobBudgetManifestGraph(...)` and
`createWorkerJobBudgetAdaptersFromManifest(...)` over rebuilding the adapter
definitions manually. This keeps early adopters such as `gpu-lighting`,
`gpu-particles`, and `gpu-physics` aligned on one integration path.

## Observability Notes

Portable WebGPU does not guarantee direct access to total GPU memory or core
count. `@plasius/gpu-debug` therefore reports tracked allocations, dispatch
counts, queue depths, estimated invocations, and optional host-supplied hardware
hints instead of claiming unavailable counters as authoritative.

For local governor observability, `@plasius/gpu-performance` now also emits a
compact `workerGraph` summary on decisions and state snapshots when registered
modules expose DAG worker metadata. That summary covers roots, priority lanes,
protected job counts, and maximum fan-out without leaking queue internals into
the package boundary.
