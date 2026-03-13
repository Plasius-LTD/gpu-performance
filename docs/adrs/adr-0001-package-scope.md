# ADR-0001: GPU Performance Package Scope

## Status

- Accepted
- Date: 2026-03-13
- Version: 1.0
- Supersedes: N/A
- Superseded by: N/A

## Context

Plasius needs one package that can monitor runtime performance across phones,
VR/XR headsets, and high-end gaming machines while coordinating adaptive quality
changes across rendering subsystems. Existing GPU packages already own renderer,
lighting, particles, physics, and XR responsibilities.

Without a dedicated performance package:

- each runtime would invent its own adaptation loop,
- module quality controls would drift,
- authoritative simulation safety could be compromised by local shortcuts,
- frame target policies would become inconsistent across platforms.

## Decision

Create `@plasius/gpu-performance` as a framework-agnostic coordination package.

The package will:

- negotiate frame targets from device and mode information,
- track local frame-budget trends,
- orchestrate quality changes through module adapter contracts,
- prefer visual and non-authoritative simulation reductions before protected
  gameplay-authoritative systems,
- remain independent from renderer internals so adjacent `@plasius/gpu-*`
  packages keep ownership of their own execution details.

## Consequences

- Positive: adaptation policy becomes reusable and testable across packages.
- Positive: renderer, lighting, particle, cloth, and XR integrations stay thin
  because they only need adapter bindings.
- Negative: callers must supply module ladders and frame samples instead of
  relying on opaque internal heuristics.
- Neutral: package scope stays orchestration-focused rather than becoming a full
  renderer scheduler.

## Alternatives Considered

- Put the control loop directly inside `@plasius/gpu-renderer`: Rejected because
  quality ownership spans multiple packages.
- Let each subsystem self-regulate: Rejected due to duplicated policy and
  unpredictable cross-module behavior.

## References

- [README](../../README.md)
- [TDR-0001: Adaptive Frame Budget Governor](../tdrs/tdr-0001-adaptive-frame-budget-governor.md)
