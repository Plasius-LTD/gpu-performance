# Measured quality recovery

2026-11-05. Story site2485 / Feature1170 / Epic2271, inheriting
`gpu-demo.scene-fidelity.enabled` and existing route capabilities in the host.
This package remains framework-independent and opt-in; existing defaults stay.

The forest inspector's actual20second run achieved30FPS after input queue age was
separated from frame execution. All16 steady over-budget frames were retries of
scale.8 (about59ms); established.5/.64 levels stayed below38ms. Generic recovery
currently uses current-level headroom alone and forgets the higher level's cost.

Extend the existing quality ladder with optional measured recovery admission.
Consumers report completed execution time against the current ladder level before
calling governor.recordFrame. Retain the latest completed cost per level and a paired cost ratio per downgrade,
bounded by the existing64-level cap. Pair the last upper-level measurement with
the first positive lower-level measurement; freeze this ratio until another
downgrade so improved execution cannot erase its own historical baseline. Unknown
levels may be tried. Project a known higher level using this ratio and the latest
completed frame duration. Admit recovery only within a
caller-supplied fraction of the negotiated target interval. Faster engine/workload
measurements therefore reopen recovery without a product-specific feedback loop.
Reject invalid timings/options; zero-duration samples do not create a ratio.

The governor gains an optional adapter recovery-eligibility hook. An ineligible
adapter retains its recovery entry and cannot block eligible lower entries.
Existing adapters and disabled measured recovery retain previous behaviour.
Admission only gates automatic upgrades; overload reduction and authoritative
restrictions are unchanged. No transport/analytics, new governor, GPU resources,
engine targets, adaptive-pixel/depth work or package dependency changes.

Requirements-first tests: an observed59ms upper level cannot oscillate above a
35ms current level at24FPS; genuine engine headroom restores it; unknown levels
remain discoverable; invalid inputs reject; costs remain bounded; refused recovery
remains retryable; another eligible module still recovers; disabled path unchanged.
Integration qualifies full forest and lighter model motion, actual SPP and cadence,
plus exact full stationary HDR/display restoration. Documentation, source LCOV80%+,
types/lint/tests/build/audit/package, exact CI and approved main CD/public package
are required. Rollback omits the option; host feature disable remains authoritative.

## Development dependency validation

The runtime audit was clean. The existing build/test lock contained22 advisory
findings, including9high, in Vitest mock registration, Vite development serving,
glob cancellation/matching, brace expansion and source-map parsing. Only affected
tooling and required transitives were advanced to patched versions; production
dependencies were unchanged. Full audit, tests, types, lint and package checks
passed afterward. Site dependency-refresh hold2330 remains unchanged.
