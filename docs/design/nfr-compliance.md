# NFR Compliance

## Scope

This package is expected to satisfy the shared Plasius NFR baseline in
[NFR.md](../../NFR.md).

## Security

- All public inputs are validated before use:
  - device profile enums and numeric fields,
  - frame-target negotiation inputs,
  - quality ladder identifiers and level bounds,
  - frame samples, including optional `frameId` and `signal`.
- The governor fails fast when WebGPU support is explicitly unavailable.
- No secrets, credentials, or custom cryptography are introduced.

## Privacy

- The package does not persist personal data.
- Local telemetry hooks are caller-owned and are documented to route through
  `@plasius/analytics` when analytics export is required.
- Error records are structured and bounded; stack traces and raw thrown values
  are not propagated by default.

## Reliability

- Frame history is bounded by `sampleWindowSize`.
- Duplicate `frameId` values are ignored to provide idempotent frame recording.
- Aborted samples are ignored before processing.
- Adapter snapshot and quality-step failures are isolated so one broken module
  does not destabilize the governor.
- Telemetry hook failures are isolated and reported as structured errors instead
  of crashing the runtime.

## Performance

- The governor keeps a bounded rolling window and bounded retained error/frame-id
  histories.
- No blocking I/O or retry loops exist in the runtime path.

## Observability

- Decisions expose metrics, adjustments, and structured error records.
- State snapshots expose bounded recent error history.
- Callers can forward telemetry through `@plasius/analytics`.

## Maintainability and Testability

- Logic remains split across device normalization, ladder adapters, validation,
  and the governor.
- Unit tests cover validation, degrade/recovery behavior, idempotency, and
  failure isolation.
