# TDR-0001: Adaptive Frame Budget Governor

## Status

- Accepted
- Date: 2026-03-13
- Version: 1.0
- Supersedes: N/A
- Superseded by: N/A

## Scope

This TDR governs the runtime control loop used to classify performance pressure,
apply quality changes, and recover quality when stability returns.

## Context

The governor must:

- operate on-device with no backend dependency,
- keep frame delivery stable across flat and XR modes,
- react to trends rather than a single noisy frame,
- avoid automatic degradation of authoritative gameplay simulation by default.

## Design

The governor uses a rolling sample window plus an exponential moving average
(EMA).

Key behaviors:

- Negotiate a target frame rate and derive target frame time.
- Track average frame time, EMA frame time, P95 frame time, drop ratio, and a
  simple trend delta between older and newer halves of the sample window.
- Validate frame samples at the boundary and support duplicate-id suppression
  plus aborted-sample rejection.
- Classify pressure as `stable`, `recovering`, `elevated`, `critical`, or
  `starved`.
- Apply downgrade steps with cooldowns and bounded per-cycle change counts.
- Maintain a recovery stack so restored quality generally reverses earlier
  degradations.
- Require sustained recovery before raising quality again.
- Isolate module and telemetry failures into structured bounded error records.

## Data Contracts

- `DeviceProfile`
- `FrameTargetProfile`
- `FrameSample`
- `GovernorMetrics`
- `GovernorDecision`
- `PerformanceGovernor`

## Operational Considerations

- Reliability: hysteresis and cooldowns reduce oscillation.
- Observability: decisions can be emitted through telemetry hooks and should be
  forwarded through `@plasius/analytics` when analytics export is required.
- Security: runtime inputs are validated and no remote control path is required.
- Cost: v1 keeps control local and avoids backend or persistence costs.

## Rollout and Migration

- Start with renderer-facing and obvious visual ladders such as resolution,
  shadows, particles, and reflections.
- Integrate non-authoritative simulation ladders next, such as cloth.
- Keep authoritative physics locked until a later design explicitly allows safe
  scaling.

## Risks and Mitigations

- Risk: oscillation under unstable workloads.
  Mitigation: windowed trend checks, downgrade and upgrade cooldowns, and
  recovery thresholds.
- Risk: poor module ordering could degrade the wrong effect first.
  Mitigation: explicit domain ordering and adapter importance metadata.

## Open Questions

- Whether later versions should support profile learning or persisted device
  overrides.
- Whether GPU/CPU sub-budgets should influence adaptation policy directly in a
  future version.
