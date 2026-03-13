# Adaptive Performance System

## Goals

- Maintain stable frame delivery through local adaptation.
- Negotiate targets per device and runtime mode.
- Protect authoritative gameplay systems by default.
- Keep integrations explicit across `@plasius/gpu-*` packages.
- Prefer worker-job budgets as the shared actuation surface for GPU compute
  packages.

## Control Loop

1. Normalize the device profile.
2. Negotiate the target frame rate and frame-time guardrails.
3. Record each frame sample into a rolling history window.
4. Compute metrics:
   - average frame time
   - EMA frame time
   - P95 frame time
   - drop ratio
   - trend delta between older and newer halves of the window
5. Classify pressure.
6. Apply bounded downgrade or upgrade actions.
7. Emit an optional telemetry callback with the decision.

## Analytics Routing

- The governor only emits local hook payloads.
- If those payloads need batching, transport, or persistence, route them through
  `@plasius/analytics`.
- Do not add a second analytics queue or event-client abstraction inside
  `@plasius/gpu-performance`.

## Runtime Safety Controls

- Reject invalid device, ladder, and frame-sample inputs at the boundary.
- Fail fast when WebGPU support is explicitly unavailable.
- Ignore aborted or duplicate frame samples instead of processing stale work.
- Bound retained frame history, error history, and duplicate-id memory.
- Isolate adapter and telemetry failures into structured error records.

## Pressure Model

- `stable`: within budget and not materially worsening.
- `recovering`: comfortably under budget with a non-positive trend.
- `elevated`: slightly over budget or worsening.
- `critical`: clearly over budget or trending badly.
- `starved`: severe overrun or heavy drop ratio.

## Default Degrade Order

1. Resolution / render scale
2. Shadows
3. Volumetrics
4. Reflections
5. Post-processing
6. Lighting detail
7. Particles
8. Cloth
9. Geometry / texture detail
10. XR-specific visual features
11. Physics only if explicitly allowed

## Recovery Policy

- Wait for a sustained stable or recovering window.
- Respect a longer cooldown for upgrades than downgrades.
- Restore in reverse order of earlier degradations when possible.

## Integration Notes

- `@plasius/gpu-worker`: current and future compute-heavy `@plasius/gpu-*`
  packages should expose discrete worker jobs and budget ladders that this
  governor can degrade or recover.
- `@plasius/gpu-renderer`: render scale, post-processing, presentation toggles.
- `@plasius/gpu-lighting`: technique profile changes, shadow detail, volumetrics.
- `@plasius/gpu-particles`: density, update cadence, effect complexity.
- `@plasius/gpu-physics`: locked by default for authoritative systems.
- `@plasius/gpu-xr`: foveation or XR-specific quality features when available.
- `@plasius/gpu-debug`: optional local instrumentation for tracked memory,
  dispatch, queue, and frame-budget observations.
- `@plasius/analytics`: optional export path for negotiated targets and
  adaptation decisions.
