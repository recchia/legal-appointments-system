# ADR-002 — Express + Layered Architecture over NestJS

**Date:** 2026-04-20
**Status:** Accepted

## Context

The job description specifies Node.js + Express as the backend stack. Before starting the challenge I confirmed with the recruiter whether NestJS was acceptable. The answer was to use Express to match the team's existing conventions.

The challenge is then: Express doesn't provide structure out of the box. Without deliberate layering, Express apps become difficult to test and maintain as they grow.

## Decision

Use Express with a manually enforced layered architecture:

```
Controller → Service → Repository → Prisma → PostgreSQL
```

**Each layer has a single responsibility:**

- **Controller** — validates HTTP input via Zod, calls the service, maps the result to an HTTP response. No business logic.
- **Service** — enforces business rules, raises typed domain errors, orchestrates across repositories.
- **Repository** — wraps Prisma queries. The service layer never imports Prisma directly — this keeps business logic ORM-agnostic and makes testing clean.

**Dependency injection is manual via constructor parameters.** A single `container.ts` file at the application root constructs every class and wires its dependencies explicitly:

```typescript
export const appointmentService = new AppointmentService(
  appointmentRepo,
  lawyerRepo,
  clientRepo,
  conflictDetector,
  timezoneService,
  clock,
);
```

The entire dependency graph is visible in one file. No DI framework, no decorators, no annotation scanning.

## Alternatives considered

**NestJS** — provides DI, decorators, modules, guards, and interceptors out of the box. Closer to Spring Boot in structure. Rejected per team preference. Would be the right choice for a new greenfield project with a larger team.

**Fastify** — faster than Express in benchmarks, good TypeScript support. Not the team's current stack.

**A DI framework (Inversify, Awilix)** — considered for the composition root. Rejected because the dependency graph has ~10 classes — explicit wiring in `container.ts` is readable and debuggable. A DI container becomes attractive at ~15+ services.

**Flat structure (everything in one file or one directory)** — fast initially, expensive to maintain and impossible to unit test without mocking the entire world.

## Consequences

- The architecture is explicit and readable — no framework magic to understand
- Services are unit-testable with hand-written fake repositories and no mocking library
- Debugging is straightforward — a stack trace points directly to the layer where an error originated
- Adding a new service requires manually updating `container.ts` — a minor cost, a useful forcing function to keep the graph intentional
- The layered pattern is directly transferable to the team's existing Express codebase
