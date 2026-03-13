# ADR-0002: Device-Negotiated Frame Targets

## Status

- Accepted
- Date: 2026-03-13
- Version: 1.0
- Supersedes: N/A
- Superseded by: N/A

## Context

The performance system must support flat/mobile and XR/VR hardware with
different refresh expectations. A single hard-coded FPS target is too rigid:

- phones and desktop displays often center on 60 Hz or 120 Hz buckets,
- XR hardware commonly expects 72 Hz, 90 Hz, or 120 Hz session rates,
- device refresh and supported frame-rate sets can differ by runtime mode.

## Decision

The package will negotiate a target frame rate per device profile and runtime
mode.

- Flat/mobile defaults start from a 60 FPS floor and can negotiate upward.
- XR/VR prefers native or supported headset session rates when available.
- Negotiation outputs both the target frame rate and the frame-time guardrails
  used by the control loop for downgrade and upgrade decisions.

## Consequences

- Positive: control policy reflects real device constraints instead of a single
  global assumption.
- Positive: callers can reuse one governor across flat and immersive modes.
- Negative: callers must provide accurate refresh and supported-rate metadata.
- Neutral: target negotiation is deterministic rather than benchmarking-based in
  v1.

## Alternatives Considered

- Global 60 FPS target for every device: Rejected because XR headsets often need
  different cadence expectations.
- Runtime benchmarking before every session: Rejected for v1 due to startup
  complexity and added variability.

## References

- [TDR-0001: Adaptive Frame Budget Governor](../tdrs/tdr-0001-adaptive-frame-budget-governor.md)
- [Design: Adaptive Performance System](../design/adaptive-performance-system.md)
