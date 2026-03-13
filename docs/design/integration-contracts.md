# Integration Contracts

## Adapter Pattern

Each subsystem exposes a `PerformanceModuleAdapter` to the governor.

The adapter must provide:

- `id`
- `domain`
- `authority`
- `importance`
- `getSnapshot()`
- `stepDown(context)`
- `stepUp(context)`

## Ladder Expectations

- Levels are ordered from lowest quality to highest quality.
- Each level has a stable identifier for logs and testing.
- Each level carries the caller-owned config payload applied to the subsystem.
- Estimated cost is optional and advisory.

## Worker-Job Adapters

When a package executes compute work through `@plasius/gpu-worker`, the
preferred contract is a worker-job budget adapter rather than a package-local
quality governor.

Each worker-job adapter should expose:

- a stable `jobType` label aligned with the worker registry,
- a `queueClass` describing the logical lane for balancing,
- budget levels that bound dispatch count, jobs per dispatch, cadence, and
  optional queue-depth guardrails,
- a package-owned translation layer from budget config into worker pipeline
  scheduling.

This keeps `@plasius/gpu-performance` responsible for pressure classification
and priority order while `@plasius/gpu-worker` remains responsible for queueing
and execution.

## Authoritative Systems

- Use `authority: "authoritative"` for gameplay-critical systems.
- Automatic downgrade is blocked unless the governor option
  `allowAuthoritativeScaling` is enabled.
- A single fixed level is valid for modules that should never change.

## Telemetry

The governor can emit:

- negotiated target profile,
- per-frame decisions,
- module adjustments.

These hooks are intended for analytics or debugging, not for required runtime
control. When analytics export is needed, wire these hooks into
`@plasius/analytics` instead of introducing package-local analytics transport or
storage.
