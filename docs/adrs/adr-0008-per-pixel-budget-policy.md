# ADR 0008: Per-pixel policy extends the existing governor

- Status: Implemented; renderer integration pending
- Date: 2026-09-13
- Task: gpu-performance#39; Story: plasius-ltd-site#2119; Feature: #2114
- Flag: `renderer.sampling.adaptivePerPixel.enabled` (off)

## Decision

Provide pure normalization, conservative importance and stochastic-tier reference
functions in gpu-performance. Reuse the current governor's effective frame
ceiling; never create a second adaptive feedback loop. The renderer remains the
owner of classifiers, protection evidence, GPU scheduling, camera-sample identity
and complete-count accumulation. The policy itself adds no timers or GPU memory.

Preserve the configured maximum as the sequence period independently of budget
reductions. Use power-of-two interior tiers with exact minimum/maximum endpoints:
retaining a non-power-of-two minimum permits unbiased adjacent-tier selection
without dropping below the minimum. Missing/invalid classifier evidence cannot
contribute a reduction, and required importance overrides all soft reductions.

## Consequences and verification

Tests cover disabled no-touch behavior, all 1..256 ceilings, custom tiers,
effective ceiling changes, limits/floors, malformed inputs, protective overrides
and expected budgets over stratified thresholds. Every changed source appears
in combined LCOV. Keep existing governor/adapter tests and release gates intact.
CPU evidence is not GPU parity, image qualification or proof of a performance gain.

No public route or rollout flag changes here. Default-off rollback is the fixed
GPU-native dispatcher with no adaptive allocations. Three.js is prohibited; no
compatibility, local publication or production-release bypass is introduced.
