# Legal Appointments System

Multi-timezone appointment scheduling for legal practices. Lawyers manage independent calendars; clients book appointments across countries and timezones with full DST-aware conversion.

Built as a technical challenge for Fontanella SRL.

[![CI](https://github.com/recchia/legal-appointments-system/actions/workflows/ci.yml/badge.svg)](https://github.com/recchia/legal-appointments-system/actions/workflows/ci.yml)

---

## Quick start

**Requirements:** Docker, Docker Compose v2

```bash
git clone git@github.com:recchia/legal-appointments-system.git
cd legal-appointments-system
docker compose up -d
```

That's it. Three services start automatically:

| Service  | URL                   | Description              |
|----------|-----------------------|--------------------------|
| Web UI   | http://localhost:5173 | React frontend via nginx |
| API      | http://localhost:3000 | Express REST API         |
| Postgres | localhost:5432        | PostgreSQL 18            |

Migrations run automatically on API startup. To seed demo data (3 lawyers across Argentina, Mexico, and Spain):

```bash
docker compose exec api pnpm exec prisma db seed
```

No local tooling required — runs inside the already-started API container.

---

## Local development

**Requirements:** Node.js 22, pnpm 10+

```bash
pnpm install

# Start Postgres only
docker compose up -d postgres

# Run API and web in parallel with hot reload
pnpm dev
```

| Service | URL                   |
|---------|-----------------------|
| Web     | http://localhost:5173 |
| API     | http://localhost:3000 |

### Useful commands

```bash
# Run all tests
pnpm -r run test

# Typecheck everything
pnpm -r run typecheck

# Lint everything
pnpm -r run lint

# Prisma Studio (database browser)
cd apps/api && pnpm exec prisma studio

# Reset and reseed the database
cd apps/api && pnpm exec prisma migrate reset
```

---

## Architecture

### Monorepo structure

```
legal-appointments-system/
├── apps/
│   ├── api/          # Express + TypeScript + Prisma
│   └── web/          # React + Vite + TypeScript
├── packages/
│   └── shared/       # Shared TypeScript types (DTOs, enums)
└── docs/
    └── adr/          # Architecture Decision Records
```

Managed with pnpm workspaces. The `shared` package is the single source of truth for types consumed by both apps — no duplication, no drift.

### Backend layers

```
HTTP Request
    ↓
Controller     — Zod validation, thin HTTP translation
    ↓
Service        — Business rules, domain errors
    ↓
Repository     — Prisma wrappers, DB boundary
    ↓
PostgreSQL
```

Dependency injection is manual — a single `container.ts` composition root wires all classes explicitly. No DI framework; the graph is small enough that explicit is clearer.

### Domain services

| Service                   | Responsibility                                                       |
|---------------------------|----------------------------------------------------------------------|
| `TimezoneService`         | IANA validation, UTC ↔ local conversion, DST-aware                  |
| `ConflictDetectorService` | Half-open interval overlap detection for lawyer calendars            |
| `LawyerService`           | Lawyer CRUD with email uniqueness and timezone validation            |
| `AppointmentService`      | Booking orchestration — validates, checks conflicts, snapshots timezones |
| `Clock` (interface)       | Injectable system time — `FixedClock` and `AdvanceableClock` for tests |

### Timezone strategy

All timestamps are stored in UTC (`TIMESTAMPTZ`) in the database. IANA timezone names (e.g. `America/Argentina/Buenos_Aires`) are stored on entities, never UTC offsets — offsets don't handle DST. Conversion happens at the API boundary only; the domain layer is UTC-native.

**Timezone snapshots:** appointments capture the lawyer's and client's timezone at booking time. If a lawyer relocates and changes timezone, historical appointments still render correctly. This is the same pattern as storing a shipping address snapshot rather than a reference.

See [ADR-003](docs/adr/003-timezone-strategy.md) for full rationale.

### Conflict detection

Uses half-open interval semantics `[start, end)`. Two appointments overlap iff:

```
a.start < b.end  AND  b.start < a.end
```

This makes back-to-back appointments (`A ends 10:00, B starts 10:00`) legal by default, matching user expectations. The Prisma query implements this with `lt`/`gt` operators backed by a composite index on `(lawyerId, startsAtUtc, endsAtUtc)`.

See [ADR-004](docs/adr/004-conflict-detection.md).

### Clock abstraction

Business logic never calls `new Date()` directly. A `Clock` interface is injected:

- `SystemClock` — production, delegates to `new Date()`
- `FixedClock` — tests with a frozen instant
- `AdvanceableClock` — tests that need time to progress between steps

Equivalent to PHP's `lcobucci/clock` or Java's `java.time.Clock`.

---

## API reference

All endpoints are prefixed with `/api`.

### Lawyers

| Method | Path                    | Description                       |
|--------|-------------------------|-----------------------------------|
| GET    | `/lawyers`              | List all lawyers                  |
| GET    | `/lawyers/:id`          | Get lawyer by ID                  |
| POST   | `/lawyers`              | Create a lawyer                   |
| PATCH  | `/lawyers/:id`          | Update a lawyer                   |
| DELETE | `/lawyers/:id`          | Delete a lawyer                   |
| GET    | `/lawyers/:id/calendar` | Get appointments in a time window |

Calendar query params: `from` and `to` as ISO 8601 strings with timezone offset.

### Appointments

| Method | Path                | Description             |
|--------|---------------------|-------------------------|
| GET    | `/appointments/:id` | Get appointment by ID   |
| POST   | `/appointments`     | Create an appointment   |
| PATCH  | `/appointments/:id` | Update / reschedule     |

### Error responses

All errors follow a consistent shape:

```json
{
  "code": "APPOINTMENT_CONFLICT",
  "message": "Appointment conflicts with: apt-id-1",
  "conflictingIds": ["apt-id-1"]
}
```

| Code                    | Status | Meaning                              |
|-------------------------|--------|--------------------------------------|
| `VALIDATION_ERROR`      | 400    | Zod schema validation failed         |
| `INVALID_LAWYER_DATA`   | 400    | Invalid timezone or other field      |
| `LAWYER_NOT_FOUND`      | 404    | No lawyer with that ID               |
| `APPOINTMENT_NOT_FOUND` | 404    | No appointment with that ID          |
| `PARTY_NOT_FOUND`       | 404    | Lawyer or client not found           |
| `EMAIL_ALREADY_IN_USE`  | 409    | Lawyer email already registered      |
| `APPOINTMENT_CONFLICT`  | 409    | Overlapping appointment exists       |
| `APPOINTMENT_IN_PAST`   | 422    | Appointment start is in the past     |
| `INTERNAL_ERROR`        | 500    | Unexpected server error              |

---

## Data model

```
Country ──< Lawyer ──< Appointment >── Client
```

Key decisions:

- UUIDs as primary keys (`@db.Uuid`) — portable, no sequential enumeration
- `TIMESTAMPTZ(6)` for all timestamps — UTC storage, microsecond precision
- `text[]` for lawyer specialties — simple, no join table needed at this scale
- `onDelete: Restrict` throughout — no cascade deletes; archiving is a future concern

---

## Testing

```bash
pnpm -r run test
```

**86 tests across two packages:**

- 75 API unit tests — pure domain layer, zero mocks, hand-written fake repositories
- 11 web component tests — React Testing Library, API mocked via `vi.mock`

The API test suite deliberately avoids mocking libraries. Fake repositories implement the same interface as real ones and filter in memory — if the interface changes, the fake breaks too.

The `Clock` interface enables time-sensitive tests without fake timers:

```typescript
const clock = new FixedClock('2026-04-22T10:00:00Z');
// service.create() sees "now" as April 22 — fully deterministic
```

Test process timezone is pinned to UTC in `vitest.config.ts` — prevents machine-timezone-dependent failures (a real bug found during development; see ADR-003).

---

## What I would do next

In priority order:

1. **Real authentication** — Entra ID integration via MSAL. The auth stub (`X-User-Id` header) is a documented placeholder; the service boundary is already in place.
2. **Client management UI** — clients exist in the DB but have no frontend CRUD yet. The API layer supports it.
3. **Email notifications** — appointment confirmation and reminders via a queue consumer.
4. **Recurring appointments** — RRULE modeling; non-trivial but well-understood domain.
5. **Database schema migrations (Flyway/Liquibase)** — explicit migration management instead of relying on Prisma's `migrate deploy`.
6. **Bundled API output** — replace `tsx` runtime with an esbuild bundle step.
7. **Playwright E2E tests** — the test architecture is structured so a Playwright suite can be added without touching existing tests.

---

## Technical decisions

| ADR | Decision |
|-----|----------|
| [001](docs/adr/001-monorepo-structure.md) | pnpm monorepo with shared types package |
| [002](docs/adr/002-express-layered-architecture.md) | Express + layered architecture over NestJS |
| [003](docs/adr/003-timezone-strategy.md) | UTC storage + IANA names + timezone snapshots |
| [004](docs/adr/004-conflict-detection.md) | Half-open interval conflict detection |
| [005](docs/adr/005-auth-strategy.md) | Stubbed auth with Entra ID ready boundary |
