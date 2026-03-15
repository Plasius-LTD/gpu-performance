# Changelog

All notable changes to this project will be documented in this file.

The format is based on **[Keep a Changelog](https://keepachangelog.com/en/1.1.0/)**, and this project adheres to **[Semantic Versioning](https://semver.org/spec/v2.0.0.html)**.

---

## [Unreleased]

- **Added**
  - Governor decision and state snapshots now expose compact DAG worker-graph
    summaries when registered modules publish worker metadata.

- **Changed**
  - CI and CD workflows now upload coverage through the Codecov CLI instead of
    the JavaScript action wrapper, removing the remaining Node 20 action path.
  - Degrade selection now protects DAG roots, higher-priority jobs, and
    higher-fan-out jobs before lower-value leaf work.

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.1.1] - 2026-03-14

- **Added**
  - `createWorkerJobBudgetManifestGraph(...)` so worker manifests can be
    normalized into roots, dependents, topological order, and priority lanes
    before budget adaptation.

- **Changed**
  - Worker-job budget adapters now expose derived DAG metadata including
    `dependents`, `dependencyCount`, `unresolvedDependencyCount`,
    `dependentCount`, and `root`.
  - Worker-governance docs now describe the multi-root DAG contract explicitly,
    instead of treating it as implied manifest metadata.

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.1.0] - 2026-03-13

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.1.0] - 2026-03-13

- **Added**
  - Initial `@plasius/gpu-performance` package scaffold based on the Plasius package template standard.
  - Device-aware frame-target negotiation, quality ladder adapters, and a local trend-aware GPU performance governor API.
  - ADRs, TDRs, and design documentation for adaptive rendering quality governance.
  - Unit tests and a runnable console demo for package verification.
  - NFR compliance documentation covering validation, reliability, and observability controls.
  - Worker-job budget adapters so `@plasius/gpu-*` packages can expose
    `@plasius/gpu-worker` scheduling budgets through the governor.
  - A manifest-to-adapter helper for adopting `gpu-*` packages that already
    publish worker governance manifests.
  - Standard GitHub CI/CD and scheduled npm audit workflows for package
    validation and release automation.

- **Changed**
  - Documented `@plasius/analytics` as the required analytics/export path for governor telemetry instead of defining package-local analytics behavior.
  - Removed copied template package-identity references from package docs and legal text.
  - Hardened runtime validation, error isolation, and idempotent frame handling to align the governor with the package NFR baseline.
  - Documented worker-job-first governance as the preferred adaptation pattern
    for current and future compute-heavy `@plasius/gpu-*` packages.
  - Expanded worker-governance guidance with a first-consumer manifest adoption
    path for lighting and particle packages.
  - Preserved worker manifest `schedulerMode`, `priority`, and `dependencies`
    in worker-budget adapters so DAG-shaped package manifests flow through the
    governor unchanged.
  - Added repository release-automation guidance reflecting the new GitHub
    workflow set.
  - Updated package maintenance guidance to use the Node 24 baseline reflected in
    `.nvmrc`.

- **Fixed**
  - Prevented invalid configuration, duplicate frame ingestion, aborted samples, and failing adapters/telemetry hooks from destabilizing the governor.

- **Security**
  - WebGPU-only scope documented to avoid unsupported degraded runtime paths.


[0.1.0]: https://github.com/Plasius-LTD/gpu-performance/releases/tag/v0.1.0
[0.1.1]: https://github.com/Plasius-LTD/gpu-performance/releases/tag/v0.1.1
