# Coverage-first refinement budget contract

Task #51, site Feature #2367 / Story #2368 / Epic #2113.
Parent `renderer.sampling.progressiveRefinement.enabled`, with independent
foveated/stationaryRefinement/performanceBudget controls, all default disabled.
The site registry Task #2369 registers these via the existing remote evaluator.
No production activation. Three.js is prohibited, including rollback.

Extend the existing pure adaptive policy and wavefront budget adapter; do not
add a timer, retained measurements, controller loop or competing governor here.
The integration supplies negotiated effective SPP/budget and prior completed
work-unit cost. Renderer owns GPU work, counts, history, generations and progress.
Shared/camera owns timestamped interaction state and stationary detection.

`normalizeWavefrontRefinementPolicy` validates and snapshots enabled options,
configured moving/total1..256 SPP, maximum work units per batch, focus UV/radii/
edge importance and independent child selections. Disabled ignores unused options.
Defaults: moving32, total256, work units16, focus[.5,.5], radii.15/.75, edge0.
All are configurable. Sequence period is the configured total, never batch size.

`planWavefrontRefinement` consumes moving/preview-complete state, existing
effective SPP ceiling, explicit frame-time budget, already spent host/job time
and estimated work-unit time. It returns coverage/focus/stationary phase, target
tiers/maximum, focus/global catch-up selection, admitted work units and reason.
It neither creates a per-pixel host map nor changes integrand/quality settings.

Before complete preview, target1 everywhere; no focus extras. During motion,
focus targets stay bounded by the existing governor's effective ceiling. After
stationarity, whole-screen targets retain the configured total while per-batch
work admission still respects performance pressure. A focus-only change may
preserve history; renderer validates integrand epochs independently.

Omitted/zero explicit budget or disabled budget child means no budget reduction,
not an implicit different governor. Unknown cost admits one calibration unit.
Known cost admits floor(remaining budget / prior unit cost), bounded by the
configured work-unit cap. Optional moving extras admit zero if none fit. Coverage
and stationary progress admit one indivisible unit even if it overruns, with the
explicit `minimum-work-unit-over-budget` reason. This is not a hard deadline or
60Hz promise, and one unit does not mean full-screen coverage. Renderer must
finish every initial coverage tile before optional work or coherent presentation.

`wavefrontRefinementImportance` is the CPU focus reference: aspect-correct radius,
configured smoothstep inner/outer radii and peripheral floor. GPU parity belongs
to renderer; reuse existing adjacent-tier quantization. No radiance-derived
importance/variance stopping or optional estimator correctness claim is added.

Requirements-first tests cover disabled ignored inputs; frozen option snapshots;
counts/tier endpoints; invalid/nonfinite values; unknown/budget-zero/overrun work;
moving ceiling, focus and global stationary catch-up; aspect/focus boundaries and
sequence period unaffected by budget. Require full tests/coverage>=80% and changed
source LCOV, types/lint/build/package/Zero-Three/audits and exact-head CI.

Initial audit finds existing development-only brace/minimatch/glob, source-map-js
and Vite/Vitest advisories. Preserve the red audit and verify compatible patched
registry versions before narrow override/lock updates. Keep the runtime graph
and quality thresholds; run matching/source-map and full tool/test validation.
No local publishing. Physical native1080p/4K HDR/count/segment, image quality,
GPU/total timings, memory and device qualification stay renderer/lighting gates;
this policy alone cannot establish performance or convergence.
