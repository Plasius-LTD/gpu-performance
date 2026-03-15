# TDR-0004: Ray-Tracing-First Quality Budget Contract

## Status

Proposed

## Goal

Define the future budget contract that `@plasius/gpu-performance` should expose
for ray-tracing-first world rendering.

## Planned Budget Dimensions

The contract should be able to describe, independently or in coordinated
groups:

- geometry fidelity
- animation fidelity
- deformation fidelity
- material or shading complexity
- shadow source and shadow budget
- ray-tracing participation or proxy fidelity
- lighting sample budget
- update cadence and temporal reuse

## Representation Tiers

The contract should also preserve representation-tier context for the work being
managed:

- `near`: premium live rendering and RT participation
- `mid`: simplified live rendering with selective RT
- `far`: proxy-heavy rendering with coarse shadow and lighting participation
- `horizon`: shell, impostor, or baked far-field representation

## Importance Signals

Degrade and recovery ordering should be able to consider:

- distance from the player or active camera
- visibility or on-screen impact
- gameplay importance
- motion or temporal instability
- shadow or reflection significance

## Planned Tests

Contract tests should prove that:

- the governor can describe multiple quality dimensions without flattening them
  into one scalar
- representation tiers survive adapter normalization
- authoritative jobs remain protected while visual budgets scale

Unit tests should prove that:

- near-field work outranks far-field work when pressure rises
- leaf or proxy work degrades before high-fan-out RT or lighting roots
- temporal reuse and update cadence can scale independently from geometry cost
