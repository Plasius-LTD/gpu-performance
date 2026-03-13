# ADR-0005: Worker-Job-First Governance

## Status

- Proposed -> Accepted
- Date: 2026-03-13
- Version: 1.0
- Supersedes: N/A
- Superseded by: N/A

## Context

`@plasius/gpu-performance` currently coordinates module quality ladders well,
but the broader `@plasius/gpu-*` ecosystem is expanding toward more discrete GPU
work types: post-processing, cloth, fluids, lighting refresh, voxel generation,
and similar compute-heavy systems. If each package invents its own adaptation
surface, the frame governor loses a consistent way to balance work across the
stack.

`@plasius/gpu-worker` already provides a queue and per-type worklist model that
fits these workloads. We need a shared policy that lets the governor manage job
budgets without taking over worker internals.

## Decision

We will make worker-job budgets the preferred actuation surface for
current and future `@plasius/gpu-*` compute packages.

- Packages that execute work through `@plasius/gpu-worker` should expose stable
  worker job types and laddered budget configs.
- `@plasius/gpu-performance` will continue to classify pressure and rank
  degradations, but package integrations should prefer worker-job budget
  adapters over bespoke local control loops.
- The worker budget contract will cover bounded dispatch count, job batch size,
  cadence, workgroup scale, and optional queue-depth guardrails.
- Authoritative gameplay workloads remain protected unless callers explicitly
  allow scaling.

## Consequences

- Positive: future compute packages share one adaptation model and remain
  compatible with the existing governor.
- Positive: worker scheduling remains centralized in `@plasius/gpu-worker`
  while performance policy stays centralized in `@plasius/gpu-performance`.
- Negative: effect packages must publish explicit job manifests and budget
  ladders instead of hiding scheduling inside package internals.
- Neutral: classic quality ladders remain supported for non-worker-controlled
  systems.

## Alternatives Considered

- Keep package-specific control loops: rejected because policies would drift and
  cross-package balancing would become inconsistent.
- Move scheduling ownership into `@plasius/gpu-performance`: rejected because it
  would couple the governor too deeply to worker execution details.
- Treat worker jobs as debug-only metadata: rejected because the governor needs
  a real actuation surface, not passive labels.

## References

- `@plasius/gpu-worker` ADR-0002: Per-Type Scheduling and Worklists
- `@plasius/gpu-worker` ADR-0003: Job WGSL Registry and Assembly
- [`../design/worker-job-governance.md`](../design/worker-job-governance.md)
