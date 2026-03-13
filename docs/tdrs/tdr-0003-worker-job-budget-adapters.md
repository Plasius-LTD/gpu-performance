# Technical Design Record (TDR)

## Title

TDR-0003: Worker Job Budget Adapters

## Status

- Proposed -> Accepted
- Date: 2026-03-13
- Version: 1.0
- Supersedes: N/A
- Superseded by: N/A

## Scope

Defines the public adapter contract used to let `@plasius/gpu-performance`
govern `@plasius/gpu-worker` job budgets across current and future
`@plasius/gpu-*` compute packages.

## Context

The existing governor already manages generic quality ladders, but compute-heavy
packages need a more explicit translation layer that matches worker scheduling
concepts. The contract must be simple, testable, and safe enough for package
authors to adopt consistently.

## Design

`createWorkerJobBudgetAdapter(options)` wraps the existing ladder model and adds
worker-specific metadata:

- `jobType`: stable job identifier aligned with worker registration.
- `queueClass`: logical lane used for balancing and debug grouping.
- `levels[].config.maxDispatchesPerFrame`: bound how many dispatches the package
  may issue for that job in one frame.
- `levels[].config.maxJobsPerDispatch`: cap batch size for a dispatch.
- `levels[].config.cadenceDivisor`: optional cadence control where `2` means
  every other frame.
- `levels[].config.workgroupScale`: optional dispatch scaling factor between
  `0` and `1`.
- `levels[].config.maxQueueDepth`: optional soft guardrail for queued work.

The adapter continues to satisfy the generic `PerformanceModuleAdapter`
contract, so the existing governor does not need a second control path.

For adopting packages that already emit worker manifests, the package also
provides `createWorkerJobBudgetAdaptersFromManifest(manifest, options?)`. This
factory converts manifest job entries into the same adapter contract so
consumers do not duplicate ladder wiring across `gpu-lighting`,
`gpu-particles`, and future effect packages.

## Data Contracts

- `WorkerJobQueueClass`
- `WorkerJobBudgetConfig`
- `WorkerJobBudgetAdapterOptions`
- `WorkerJobBudgetManifestPerformance`
- `WorkerJobBudgetManifestJob`
- `WorkerJobBudgetManifest`
- `WorkerJobBudgetManifestAdapterOptions`
- `WorkerJobBudgetSnapshot`
- `WorkerJobBudgetAdapter`

## Operational Considerations

- Reliability: invalid job budget definitions fail fast at creation time.
- Maintainability: consumer packages can publish stable manifest data and reuse
  one manifest-to-adapter factory instead of rebuilding local adapter glue.
- Observability: adapters expose stable `jobType` and `queueClass` values for
  local debugging and analytics routing.
- Security: only numeric budget values and bounded identifiers are accepted.
- Cost: implementation reuses the existing ladder system and does not introduce
  additional runtime dependencies.

## Rollout and Migration

1. Keep existing quality ladders working unchanged.
2. Prefer worker-job budget adapters for new compute packages.
3. Migrate existing compute-heavy packages incrementally as they integrate more
   deeply with `@plasius/gpu-worker`.

## Risks and Mitigations

- Risk: package authors could treat queue classes inconsistently.
  Mitigation: keep queue classes bounded and document expected usage.
- Risk: budgets could be misused to scale authoritative simulation.
  Mitigation: retain the existing authority protection in the governor.

## Open Questions

- Whether future packages need shared manifest tooling in `@plasius/gpu-worker`
  in addition to the budget adapter contract.
