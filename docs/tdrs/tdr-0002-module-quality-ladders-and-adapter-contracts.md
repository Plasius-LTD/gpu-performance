# TDR-0002: Module Quality Ladders and Adapter Contracts

## Status

- Accepted
- Date: 2026-03-13
- Version: 1.0
- Supersedes: N/A
- Superseded by: N/A

## Scope

This TDR defines how subsystems expose adjustable quality to the governor.

## Context

Different subsystems expose different controls:

- render resolution is often scalar,
- shadows may switch cascades or filtering modes,
- particles and cloth can change density or solver counts,
- authoritative physics often exposes no safe automatic downgrade path.

The governor needs a single coordination contract without flattening these
differences into one opaque number.

## Design

Use quality ladders ordered from lowest to highest quality.

- Each ladder level has a stable `id`, caller-defined config payload, and
  optional estimated cost.
- Adapters expose `getSnapshot()`, `stepDown()`, and `stepUp()`.
- The governor consumes adapters generically and does not inspect payload shape.
- Recovery generally unwinds quality reductions in reverse order using the
  governor's recovery stack.

## Data Contracts

- `ModuleQualityLevel`
- `PerformanceModuleSnapshot`
- `PerformanceModuleAdapter`
- `PerformanceAdjustmentRecord`
- `QualityLadderAdapter`

## Operational Considerations

- Reliability: ladders avoid partial state because each step resolves to a
  discrete known configuration.
- Observability: level changes are surfaced through adapter callbacks and
  governor decisions.
- Security: configs stay caller-owned and local to the process.
- Cost: estimated cost metadata is advisory only and cheap to maintain.

## Rollout and Migration

- Existing packages can wrap their own internal settings in ladder adapters.
- Subsystems with only one safe state can still participate via a single locked
  level.
- Additional adapter types can be added later without breaking the core governor
  contract.

## Risks and Mitigations

- Risk: poorly defined ladder spacing can create visible step jumps.
  Mitigation: encourage granular levels for large-cost modules such as render
  scale and shadows.
- Risk: adapters with stale estimated cost metadata could be ordered
  suboptimally.
  Mitigation: cost remains advisory; domain order and authority policy still
  control safety.

## Open Questions

- Whether future adapters should support compound changes inside one module.
- Whether per-module warmup times should feed into restoration policy.
