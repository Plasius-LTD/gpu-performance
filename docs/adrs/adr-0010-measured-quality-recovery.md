# ADR-0010: Measured quality recovery

- Date:2026-11-05
- Status:Proposed; not released
- Story:site2485; Task:gpu-performance53; Feature1170/Epic2271

## Context

The current governor can repeatedly restore a quality level known to exceed the
host frame budget because it considers only headroom at the reduced level. The
forest inspector reproduced this with35ms reduced work and59ms recovery probes.

## Decision

Add opt-in `recoveryBudget.headroomRatio` to the existing quality ladder. Consumers
record completed frame execution before governor feedback. Keep bounded paired
upper/lower timings from each downgrade and project the higher cost using current
execution. Unknown levels remain discoverable. Generic adapters may expose
`canStepUp(context)`; a refusal retains recovery state and does not block other
eligible adapters. The existing governor owns adjustment order and cooldowns.

Hosts may also supply `target.frameBudgetRatio` to reserve part of the negotiated
interval for workload variation. It adjusts downgrade and recovery thresholds,
not the cadence target. Existing window/cooldown settings control response delay;
the inspection host supplies these values. Omission preserves prior thresholds.

## Consequences

Improved engines can restore quality through measured headroom with no host loop.
Predictions are estimates, not hard real-time guarantees. Scene/device changes
should create a fresh adapter; multiple changing dimensions can affect cost
ratios. Input queue age must be reported separately from execution duration.
Existing adapters/defaults and overload/authority rules remain unchanged. No GPU
resources, telemetry transport or dependencies are added. The host's existing
`gpu-demo.scene-fidelity.enabled` gate controls adoption; omit the option to return
to prior recovery semantics. README/tests/coverage and approved release gates apply.
