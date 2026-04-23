# ADR-001 — pnpm Monorepo with Shared Types Package

**Date:** 2026-04-20
**Status:** Accepted

## Context

The system has two deployable applications (API, web) that share domain types — enums, DTOs, and interfaces. Without a shared package, these types would be duplicated across both codebases. Drift between frontend and backend type definitions is a common source of subtle bugs in full-stack TypeScript projects: the API changes a field name, the frontend keeps using the old one, and TypeScript can't catch it across separate projects.

## Decision

Use a pnpm workspace monorepo with three members:

- `apps/api` — Express backend
- `apps/web` — React frontend
- `packages/shared` — TypeScript types shared across both apps

The shared package is a compile-time dependency only (no runtime bundle). Both apps import directly from `packages/shared/src/index.ts` via the `@legal-appointments/shared` workspace alias declared in each `package.json`.

```json
"dependencies": {
  "@legal-appointments/shared": "workspace:*"
}
```

TypeScript resolves the import at build time. In Docker builds, the repo root is the build context so all three packages are available to both Dockerfiles.

## Alternatives considered

**Separate repositories** — simpler per-repo tooling, but cross-repo type synchronisation is manual and error-prone. Any type change requires coordinated releases across two repos.

**Code generation from OpenAPI spec** — correct for large teams with a published API contract. Overkill for a two-app system where types are already in TypeScript and can be shared directly.

**Yarn or npm workspaces** — functionally equivalent. pnpm chosen for install speed, strict dependency isolation (packages can't silently access undeclared dependencies), and first-class workspace tooling.

## Consequences

- Single `pnpm install` from the repo root installs all workspaces
- Adding a type to `shared` makes it immediately available in both apps without a publish step
- TypeScript catches mismatches between API response shapes and frontend consumption at compile time
- Docker build context must be the repo root so both Dockerfiles can access `packages/shared`
- The `pnpm-workspace.yaml` file must be present at the root for workspace resolution to work
