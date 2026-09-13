# Task 39 local evidence — 2026-09-13

Base: `7c2f766` (origin/main). No dependencies or workflows changed.
Scope: CPU policy/reference functions only, not GPU scheduling or a new governor.

- Requirements-first run: eight tests failed because the new exports did not
  exist. Final run: 49 tests pass, including nine new policy cases.
- Coverage: 89.75% lines and 82.27% branches overall. `src/adaptive.ts` is 100%
  line/branch covered; `src/index.ts` is present in LCOV (export-only, zero
  executable lines). No threshold or exclusion changed.
- Lint, typecheck, dual-module build/declarations, public artifact/package
  checks, all nine Zero-Three checks and full dependency audit passed locally.
  Audit reports zero vulnerabilities. Zero-Three passed before adaptive edits.
- Default-off no-touch, all ceilings 1..256, exact endpoints, effective ceiling
  versus sequence period, classifier no-op reasons, protective overrides and
  stochastic expected value are covered. Renderer GPU parity is not covered.

No feature flags, site dependencies, camera history, GPU allocations or telemetry
transport changed. No local publication, release, image-quality, memory-saving
or speedup claim. CI and approved main/CD remain pending before release; renderer
integration and physical/matched-quality qualification remain separate gates.
