# ADR 0011: Conservative startup quality recovery

- Status: Accepted
- Date: 2026-11-16
- Work: gpu-performance#56, plasius-ltd-site#2529 / Feature #1170

## Context

Starting an unknown camera workload at maximum quality causes several missed
frame deadlines before the governor has measurements. Starting low previously
could not recover because only governor-issued downgrades entered recovery.
Hosts need independent targets and automatic benefit from faster renderer code.

## Decision

Add opt-in `recoverInitialLevels` to the existing governor and optional
`recoveryBudget.initialCostRatios` to measured ladder admission. Track at most
one pending startup recovery per registered module. Drain historical reductions
first and use the existing stability, cooldown, pressure and authority rules.
Refused upgrades stay pending. Remove stale registrations and isolate adapter
errors using the existing error path. Defaults remain unchanged.

Initial adjacent work ratios are validated and copied. Completed paired timings
after a reduction supersede the estimate. No synthetic telemetry, second control
loop or product-specific frame target enters the package.

## Consequences

Hosts can start within a known conservative workload and recover detail using
real completion times. Estimates can be conservative or inaccurate; deadlines
still depend on hardware and minimum admitted work. Hosts retain stationary
quality policy and must recreate adapters after material workload/device changes.
Tests cover admission, faster execution, lifecycle, default compatibility and
protected authoritative systems. Product qualification also measures startup,
steady motion and exact stationary restoration independently.
