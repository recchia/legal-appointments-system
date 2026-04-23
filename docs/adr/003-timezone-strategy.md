# ADR-003 — UTC Storage + IANA Timezones + Booking-Time Snapshots

**Date:** 2026-04-20
**Status:** Accepted

## Context

The system operates across multiple countries with different timezones and DST rules. Incorrect timezone handling in scheduling systems causes real harm — double-bookings, missed appointments, incorrect confirmation emails. This is the single highest-risk domain concern in the entire system.

Three sub-problems need solving:

1. **Storage** — how do we store timestamps in the database?
2. **Entity timezone** — how do we represent where a lawyer or client is?
3. **Historical accuracy** — what happens if a lawyer moves to a different timezone after an appointment is booked?

## Decision

A three-part strategy:

### 1. Store all timestamps in UTC

All `DateTime` columns use `TIMESTAMPTZ` (timestamp with timezone) in PostgreSQL. The application layer stores and queries in UTC exclusively. Conversion to local time happens only at the API response boundary.

This means conflict detection, calendar queries, and all business logic operate on a single, unambiguous time representation.

### 2. Store IANA timezone names on entities, never offsets

Lawyers and clients have a `timezone` field containing an IANA identifier (e.g. `America/Argentina/Buenos_Aires`), never a UTC offset string (e.g. `UTC-3` or `+03:00`).

IANA names handle DST transitions correctly. `America/New_York` knows that clocks spring forward in March and fall back in November. A stored offset of `-5:00` does not — it would silently produce wrong times for half the year.

Validation uses the JavaScript runtime's `Intl.DateTimeFormat` constructor, which leverages the Node.js team's maintained tzdata:

```typescript
new Intl.DateTimeFormat('en-US', { timeZone: timezone }); // throws on invalid
```

### 3. Capture timezone snapshots on appointments at booking time

When an appointment is created, the lawyer's and client's current timezones are copied onto the appointment row:

```
lawyerTimezoneSnapshot: "America/Mexico_City"
clientTimezoneSnapshot: "America/Los_Angeles"
```

If either party later changes their timezone, historical appointments still render correctly in the timezone that was in effect at the time of booking.

This is the same pattern as storing a shipping address snapshot on an order rather than referencing the customer's current address. Business invariants must outlive the original record.

## Implementation notes

The `TimezoneService` uses `date-fns-tz` for all conversions. A known quirk of `date-fns-tz@3`: the `format()` function does not apply the `timeZone` option when the input `Date` has not been pre-converted via `toZonedTime()`. The service works around this by always calling `toZonedTime()` before `format()`.

This bug was discovered because the test suite pins the process timezone to UTC via `vitest.config.ts`:

```typescript
env: { TZ: 'UTC' }
```

Without this pin, the bug was masked on machines running in Argentine timezone. Pinning UTC ensures tests are deterministic on all developer machines and CI runners.

## Alternatives considered

**Store local time** — simpler writes, but makes overlap detection across timezones incorrect without conversion, and ambiguous during DST fall-back transitions.

**Store UTC offsets** — simpler than IANA but breaks on DST transitions. A -3:00 stored in July is wrong for Buenos Aires in winter (also -3:00, no DST), but a -4:00 stored for New York in July is wrong in January.

**Always render in UTC, let the client convert** — technically correct but poor UX. The API enriches responses with pre-computed local times for both lawyer and client perspectives.

**No timezone snapshots (always use current entity timezone)** — simpler schema, but breaks historical rendering when lawyers relocate.

## Consequences

- Conflict detection operates entirely in UTC — no timezone conversion in the critical path
- The `TimezoneService` has a 18-test suite including DST spring-forward and fall-back cases
- Adding a new timezone-aware feature requires no schema changes — the infrastructure is in place
- The `AI_USAGE.md` documents the `date-fns-tz` bug discovery as a case study in why deterministic test environments matter
