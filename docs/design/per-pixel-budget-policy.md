# Per-pixel sampling policy contract

Task gpu-performance#39, Story plasius-ltd-site#2119, Feature #2114.
Parent flag: `renderer.sampling.adaptivePerPixel.enabled`, default off.

This is a pure extension to the existing wavefront budget adapter, not another
governor. The existing governor supplies the effective frame ceiling. Policy
normalization retains the configured maximum as the sampling sequence period,
even when the effective ceiling falls. The renderer owns GPU scheduling,
classification, sample identity and actual-completed-count normalization.

## Requirements

- Disabled returns a fixed budget and does not read unused adaptive settings.
- Configured counts are finite integers clamped to 1..global ceiling (1..256).
  Effective ceiling cannot exceed the configured maximum. Minimum cannot exceed
  that ceiling. Preserve exact minimum/maximum endpoints and use sorted unique
  powers of two internally; custom interior tiers must be powers of two. An exact
  non-power-of-two minimum endpoint avoids bias when quantizing its neighbourhood.
- Default minimum is min(2, ceiling); default maximum is the global ceiling.
- First-hit/environment reductions report explicit disabled/below-eight reasons.
  Environment floors are bounded by the ceiling and never below global minimum;
  HDR floor is never below the ordinary environment floor.
- Compose qualified focus/distance/environment reductions with a maximum soft
  reduction of 0.75 by default. Invalid classifier evidence omits only its own
  reduction. Required importance overrides all reductions, including full-SPP
  geometry/material/edge protection supplied by the renderer.
- Adjacent-tier stochastic quantization receives an independent threshold in
  [0,1); expected budget equals the bounded continuous target. The caller owns
  spatially scrambled/frame-rotated thresholds, never radiance-derived stopping.
- No GPU buffers, timers, camera history, telemetry transport or runtime loop.

## Local verification and integration boundary

Requirements-first tests cover defaults, malformed input, endpoint/tier clamping,
all ceilings 1..256, effective-ceiling/sequence-period separation, stochastic
expectation, exact tiers, required overrides and classifier no-op reasons.
Run full coverage/lint/types/build/package/Zero-Three checks. Preserve the existing
governor and adapter behavior when the optional contract is absent.

GPU parity, image correctness and matched-quality gains require renderer Tasks
169/170/173 and physical execution. This package alone cannot qualify adaptation.
During runner maintenance, local results may be retained but CI/release stays
pending. No local publishing or Three.js fallback is permitted.
