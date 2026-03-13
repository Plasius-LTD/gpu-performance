# ADR-0004: Local Control Loop With Optional Telemetry Hooks

## Status

- Accepted
- Date: 2026-03-13
- Version: 1.0
- Supersedes: N/A
- Superseded by: N/A

## Context

The initial requirement is for local runtime agency. The system should adapt in
real time without depending on a backend control plane, while still leaving room
for future analytics or remote tuning.

## Decision

The governor will be a local closed-loop controller with optional telemetry
callbacks.

- Runtime safety decisions are made from local frame samples and device data.
- Telemetry hooks can emit negotiated targets and adaptation decisions.
- When those hooks are promoted into analytics events, callers must use
  `@plasius/analytics` rather than inventing a package-local analytics client or
  transport.
- No backend dependency is required for normal operation.

## Consequences

- Positive: performance protection works offline and in latency-sensitive XR
  sessions.
- Positive: future analytics can be added without changing the control loop
  contract while still sharing the existing Plasius analytics stack.
- Negative: v1 does not include centralized fleet tuning or persistent profile
  learning.
- Neutral: exported telemetry is advisory rather than authoritative.

## Alternatives Considered

- Remote-only tuning service: Rejected because local frame protection must not
  depend on network availability.
- Persisted device profile learning in v1: Rejected to keep the package focused
  and deterministic.
- Bespoke analytics client inside `@plasius/gpu-performance`: Rejected because
  Plasius already has `@plasius/analytics` as the package-level analytics
  abstraction.

## References

- [Design: Adaptive Performance System](../design/adaptive-performance-system.md)
