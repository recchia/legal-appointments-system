# ADR-005 — Stubbed Authentication with Entra ID Ready Boundary

**Date:** 2026-04-21
**Status:** Accepted (stub; production path documented)

## Context

The job description mentions Azure Entra ID as the identity provider with role-based access control by user group membership. Implementing a full OAuth2/OIDC flow requires:

- Azure App Registration
- MSAL (Microsoft Authentication Library) configuration
- JWKS endpoint validation for token verification
- Group-to-role mapping from Entra ID claims
- Session or token refresh management

This is a meaningful scope addition for a time-boxed technical challenge. The more important signal is whether the architecture is ready for it.

## Decision

Authentication is **stubbed** for the challenge. A middleware reads an `X-User-Id` header and makes it available on the request. No token validation occurs.

The stub is intentionally visible and documented — not hidden behind a `// TODO` comment. Anyone reviewing the code should immediately understand what is and is not in scope.

### The Entra ID integration boundary

The stub middleware establishes the boundary where real auth would plug in:

```typescript
// Current stub:
export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  req.userId = req.headers['x-user-id'] as string ?? 'anonymous';
  next();
}

// Production replacement — same function signature, different body:
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) { res.status(401).json({ code: 'UNAUTHORIZED' }); return; }

  try {
    const claims = await validateEntraIdToken(token); // MSAL + JWKS
    req.userId = claims.oid;
    req.userGroups = claims.groups;
    next();
  } catch {
    res.status(401).json({ code: 'INVALID_TOKEN' });
  }
}
```

### Role-based access control placement

RBAC gates would be added at the controller layer, between the middleware and the service call:

```typescript
// Example: only lawyers can cancel appointments
if (!req.userGroups.includes(LAWYER_GROUP_ID)) {
  res.status(403).json({ code: 'FORBIDDEN' });
  return;
}
```

The service layer requires no changes — it receives already-authorized calls.

## Alternatives considered

**Full Entra ID implementation** — correct for production. Requires App Registration in the Fontanella tenant, test user accounts, and MSAL configuration. Estimated 4–6 hours. Outside the challenge time budget.

**JWT with a local secret** — common in challenge submissions, provides the appearance of auth. Rejected in favor of an honest stub with documented upgrade path. A fake JWT implementation is less useful to the reviewer than understanding what production auth would look like.

**No auth at all** — all routes public. Simpler, but doesn't make the integration boundary visible.

## Consequences

- The challenge submission is honest about auth scope — the reviewer knows exactly what's missing and why
- The service boundary is Entra-ID-ready — no refactoring required to add real auth
- The composition root (`container.ts`) would need to inject the MSAL client as a dependency of the auth middleware
- Anyone cloning the repo for local development can run the full application without an Azure App Registration
