import type { Request, Response, NextFunction } from 'express';

/**
 * Authentication stub — reads X-User-Id header for local development.
 *
 * Production replacement: validate Bearer token against Azure Entra ID,
 * extract user OID and group memberships from JWT claims, and map
 * Entra ID groups to application roles (admin, lawyer, client).
 *
 * See docs/adr/005-auth-strategy.md for the full integration boundary.
 */
export function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const userId = req.headers['x-user-id'];
  req.userId = typeof userId === 'string' ? userId : 'anonymous';
  next();
}
