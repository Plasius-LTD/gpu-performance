# Contributing to @plasius/gpu-performance

First off: thanks for taking the time to contribute!
This document explains how to work on the project, how to propose changes, and what we expect in pull requests.

> TL;DR
>
> - Be respectful and follow the Code of Conduct.
> - Open an issue before large changes; small fixes can go straight to a PR.
> - Write tests, keep coverage steady or improving.
> - Use Conventional Commits.
> - Don’t include real PII in code, issues, tests, or logs.

---

## Code of Conduct

Participation in this project is governed by our **Code of Conduct** (see `CODE_OF_CONDUCT.md`). By participating, you agree to abide by it.

## Licensing & CLA

This project is open source (see `LICENSE`). To protect contributors and users, we require contributors to agree to our **Contributor License Agreement (CLA)** before we can merge PRs (see `legal/CLA.md`). You’ll be prompted automatically by the CLA bot on your first PR.

> If your company has special legal needs, please contact the maintainers before sending large PRs.

## Security

**Never** report security issues in public issues or PRs. Instead, follow the process in `SECURITY.md`.

---

## What this project does

`@plasius/gpu-performance` provides a framework-agnostic adaptive GPU
performance governance package:

- Device-aware frame-target negotiation,
- Trend-aware frame-budget monitoring,
- Quality ladder adapters for renderer-adjacent modules,
- Control-loop policies that protect authoritative gameplay systems by default.

Contributions typically fall into: new adaptation policies, module integration
contracts, type improvements, docs, tests, and tooling quality.

---

## Getting started (local dev)

### Prerequisites

- Node.js (use the version specified in `.nvmrc` if present: `nvm use`).
- npm (we use npm scripts in this repo).

### Install

```bash
npm ci
```

### Build

```bash
npm run build
```

### Test

```bash
npm test
# or, if using Vitest in watch mode
npm run test:watch
```

### Lint, typecheck, and coverage

```bash
npm run lint
npm run typecheck
npm run test:coverage
```

> Tip: set up your editor to run ESLint on save.

---

## How to propose a change

### 1) For bugs

- Search existing issues first.
- Open a new issue with:
  - Clear title, steps to reproduce, expected vs actual behaviour,
  - Minimal repro (code snippet or small repo),
  - Environment info (OS, Node, package version).

### 2) For features / refactors

- For anything non-trivial, open an issue first and outline the proposal.
- If the change affects public API or architecture, add an ADR draft (see `docs/adrs/`).

### 3) Good first issues

We label approachable tasks as **good first issue** and **help wanted**.

---

## Branch, commit, PR

**Branching**

- Fork or create a feature branch from `main`: `feat/xyz` or `fix/abc`.

**Commit messages** (Conventional Commits)

- `feat: add XR-specific target negotiation policy`
- `fix: prevent oscillation in recovery logic`
- `docs: expand analytics integration examples`
- `refactor: simplify module ladder ranking`
- `test: add cases for authoritative physics protection`
- `chore: bump dev deps`

**Pull Requests**

- Keep PRs focused and small when possible.
- Include tests for new/changed behaviour.
- Update docs (README, JSDoc, ADRs) as needed.
- Add a clear description of what & why, with before/after examples if useful.
- Ensure CI is green (lint, build, tests).

**PR checklist**

- [ ] Title uses Conventional Commits
- [ ] Tests added/updated
- [ ] Lint passes (`npm run lint`)
- [ ] Build passes (`npm run build`)
- [ ] Docs updated (README/ADR/CHANGELOG if needed)
- [ ] No real PII in code, tests, or logs

---

## Coding standards

- **Language:** TypeScript with `strict` types.
- **Style:** ESLint with strict TypeScript.
- **Tests:** Use Vitest for package runtime behavior and contract coverage.
- **Public API:** Aim for backward compatibility; use SemVer and mark breaking changes clearly (`feat!:` or `fix!:`).
- **Performance:** Avoid excessive allocations in hot paths; prefer immutable patterns but mind GC pressure.
- **Docs:** Add TSDoc comments for exported types/functions.

### Adaptation policy

- Add tests covering degrade, recovery, and hysteresis behavior.
- Keep authoritative gameplay systems protected unless a change explicitly opts
  into scaling them.
- Document any module-ordering or target-negotiation changes in ADRs/TDRs when
  they affect public package behavior.

---

## Adding dependencies

- Minimise runtime dependencies; prefer dev dependencies.
- Justify any new runtime dependency in the PR description (size, security, maintenance).
- Avoid transitive heavy deps unless critical.

---

## Versioning & releases

- We follow **SemVer**.
- Breaking changes require a major bump and migration notes.
- Keep the `CHANGELOG.md` (or release notes) clear about user-facing changes.

---

## Documentation

- Update `README.md` with new features or setup steps.
- Add or update ADRs in `docs/adrs/` for architectural decisions.
- Keep examples minimal, copy-pasteable, and tested when feasible.

---

## Maintainers’ process (overview)

- Triage new issues weekly; label and assign.
- Review PRs for correctness, tests, and docs.
- Squash-merge with Conventional Commit titles.
- Publish from CI when applicable.

---

## Questions

If you have questions or want feedback before building:

- Open a discussion or issue with a short proposal,
- Or draft a PR early (mark as **Draft**) to get directional feedback.

Thanks again for contributing 💛
