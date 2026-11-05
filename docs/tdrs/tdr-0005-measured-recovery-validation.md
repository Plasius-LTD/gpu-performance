# TDR-0005: Measured recovery validation

2026-11-05. Proposed. Task53 / Storysite2485 / Feature1170 / Epic2271.

Use paired downgrade timings rather than a continuously replaced denominator.
Otherwise a faster engine gradually erases its own speedup and never reopens the
higher level. Zero-duration readings do not establish ratios; invalid readings
reject. Storage is bounded by the existing64-level ladder limit.

Tests prove known-overbudget refusal, unknown discovery, renewed engine headroom,
blocked recovery retention and recovery of other eligible modules. Disabled
behaviour remains unchanged. Physical qualification records complete job and GPU
measurements separately, actual motion settings/SPP, p95/max/misses, allocations,
and exact full stationary HDR/display restoration. Diagnostics are separate from
un-instrumented timing runs. No target is inferred solely from fewer rays.

Local evidence is not a release. Require source LCOV>=80%, types/lint/build/tests,
audit/package checks and approved exact-main CI/CD before public consumption.
