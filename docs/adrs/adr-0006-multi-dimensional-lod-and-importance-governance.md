# ADR-0006: Multi-Dimensional LOD and Importance Governance

## Status

Accepted

## Context

The ray-tracing-first world architecture requires quality scaling across more
than geometry. Rendering effort must move by distance, visibility, gameplay
importance, temporal stability, and representation tier while leaving
authoritative simulation intact.

`@plasius/gpu-performance` already governs frame budgets and worker-job
adaptation, but the next planning stage needs an explicit policy for
multi-dimensional LOD control in a ray-tracing-first renderer.

## Decision

`@plasius/gpu-performance` will treat ray-tracing-first adaptation as a
multi-dimensional budget problem. Planned contracts should support coordinated
quality scaling across:

- geometry complexity
- animation and deformation fidelity
- material and shading cost
- shadow source and shadow fidelity
- ray-tracing representation fidelity
- lighting sample budgets
- update frequency and temporal reuse

Governance remains importance-aware:

- authoritative gameplay and physics stay protected by default
- visual and non-authoritative simulation work degrade first
- near-field and high-importance content stay protected longer than distant or
  low-value content
- representation tiers such as `near`, `mid`, `far`, and `horizon` should be
  available as explicit policy signals rather than inferred package-local rules

## Consequences

- Positive: the governor can reason about ray-tracing cost without collapsing
  everything into a single "quality level" knob.
- Positive: renderer, lighting, and world packages can share one vocabulary for
  budget adaptation.
- Positive: representation-tier planning becomes explicit before the coding
  phase starts.
- Neutral: packages still translate governor decisions into concrete render or
  worker settings locally.

## Rejected Alternatives

- Treat ray tracing as just another post-processing effect: rejected because the
  architecture makes it a premium lighting path, not a decorative add-on.
- Keep per-package LOD logic entirely local: rejected because that would make
  cross-package adaptation inconsistent and harder to test.

## Follow-On Work

- Define the technical contract for ray-tracing-first quality dimensions and
  representation tiers.
- Add contract and unit tests that describe downgrade ordering before
  implementation starts.
