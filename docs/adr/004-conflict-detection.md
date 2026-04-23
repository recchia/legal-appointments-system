# ADR-004 — Half-Open Interval Conflict Detection

**Date:** 2026-04-21
**Status:** Accepted

## Context

A lawyer cannot have two overlapping appointments. The system must detect conflicts when creating or rescheduling appointments. The detection must be:

1. **Correct** — no false positives (rejecting valid back-to-back appointments) or false negatives (missing real overlaps)
2. **Efficient** — queries should not degrade as the number of appointments grows
3. **Reschedule-aware** — moving an appointment should not conflict with its own current time slot

## Decision

### Interval semantics: half-open `[start, end)`

Two appointments overlap iff:

```
a.start < b.end  AND  b.start < a.end
```

This is the standard interval overlap formula for half-open intervals. The key property: touching intervals are **not** overlaps.

If appointment A ends at 10:00 and appointment B starts at 10:00, the check is:
- `a.start (9:00) < b.end (11:00)` → true
- `b.start (10:00) < a.end (10:00)` → **false** (10:00 is not less than 10:00)

Result: no conflict. Back-to-back appointments are legal by default, which matches user expectations.

### Implementation: Prisma query with strict operators

```typescript
startsAtUtc: { lt: windowEnd },  // existing appointment starts before proposed window ends
endsAtUtc:   { gt: windowStart } // existing appointment ends after proposed window starts
```

The `lt` and `gt` operators implement the strict `<` and `>` required for half-open semantics. Using `lte`/`gte` would incorrectly flag back-to-back appointments as conflicts.

### Database index

A composite index on `(lawyerId, startsAtUtc, endsAtUtc)` ensures the overlap query is a range scan, not a full table scan:

```sql
CREATE INDEX appointments_lawyerId_startsAtUtc_endsAtUtc_idx
  ON appointments("lawyerId", "startsAtUtc", "endsAtUtc");
```

### Status filtering

Cancelled and `NO_SHOW` appointments are excluded from conflict checks:

```typescript
status: { in: ['SCHEDULED', 'COMPLETED'] }
```

A cancelled appointment's slot is free for rebooking.

### Reschedule support

During reschedule operations, the appointment being updated is excluded via an optional `excludeAppointmentId` parameter, preventing it from conflicting with its own current database row.

### Race condition

The check-then-insert pattern has a window where two concurrent requests could both pass the conflict check before either inserts. The composite index does not prevent this at the application layer.

Production mitigation: add a PostgreSQL `EXCLUDE` constraint using `tstzrange`:

```sql
ALTER TABLE appointments
  ADD CONSTRAINT no_overlap EXCLUDE USING gist (
    "lawyerId" WITH =,
    tstzrange("startsAtUtc", "endsAtUtc") WITH &&
  );
```

This closes the race entirely at the database level. Not implemented here because Prisma's migration system does not support `EXCLUDE` constraints natively and adding raw SQL migration was outside the challenge time budget. The application-layer conflict check returns a clean `409 APPOINTMENT_CONFLICT` response in the common non-concurrent case.

## Alternatives considered

**PostgreSQL `tstzrange` + `EXCLUDE` constraint** — the production-grade approach. Rejected for this challenge due to Prisma migration system limitations and time budget.

**Closed intervals `[start, end]`** — would flag back-to-back appointments as conflicts, requiring special-casing. Half-open is the correct and standard convention.

**Application-level in-memory check only** — no database query. Incorrect for concurrent writes.

## Consequences

- Back-to-back appointments are legal by default — correct behavior
- The `ConflictDetectorService` has an 18-test suite covering all 5 overlap geometries (exact match, partial start, partial end, contained, containing) plus status filtering and reschedule edge cases
- The race condition is documented and has a clear production mitigation path
- The composite index makes conflict detection O(log n) in practice
