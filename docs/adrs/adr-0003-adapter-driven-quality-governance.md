# ADR-0003: Adapter-Driven Quality Governance

## Status

- Accepted
- Date: 2026-03-13
- Version: 1.0
- Supersedes: N/A
- Superseded by: N/A

## Context

Adaptive quality decisions need to reach several packages with different runtime
behaviors:

- `@plasius/gpu-renderer` controls resolution and presentation,
- `@plasius/gpu-lighting` owns lighting techniques and settings,
- `@plasius/gpu-particles` and cloth systems own visual density and simulation
  density,
- `@plasius/gpu-physics` must keep authoritative gameplay stable,
- `@plasius/gpu-xr` may expose XR-specific knobs such as foveation.

Hard-coding package internals into the governor would tightly couple release
cadence and make testing difficult.

## Decision

Expose adaptation through adapter contracts and quality ladders.

- Each module publishes ordered quality levels from lowest to highest quality.
- The governor asks adapters to step down or step up.
- The default policy protects authoritative modules from automatic reduction.
- Recovery uses hysteresis and reverses earlier degradations when stability
  returns.

## Consequences

- Positive: integration remains explicit and testable.
- Positive: adjacent packages can map their own settings to ladder levels.
- Negative: adapters require callers to think about quality ladders up front.
- Neutral: the governor coordinates module order but does not define each
  module's internal implementation.

## Alternatives Considered

- Mutate renderer internals directly from the governor: Rejected because package
  boundaries would collapse.
- Use a single numeric quality scalar for the whole engine: Rejected because
  different modules need different step shapes and safety policies.

## References

- [TDR-0002: Module Quality Ladders and Adapter Contracts](../tdrs/tdr-0002-module-quality-ladders-and-adapter-contracts.md)
- [Design: Integration Contracts](../design/integration-contracts.md)
