import { NextRequest } from 'next/server';
import { getSessionContext, validateCsrf } from '@/server/auth/session';
import { AppError } from '@/shared/errors';
import { SessionContext } from '@/shared/types';

/**
 * Server-side RBAC middleware and authorization checks (Rule 2, F1.2, F1.3, F1.5)
 */
export async function requireAuth(req: NextRequest): Promise<SessionContext> {
  // 1. CSRF validation on mutating requests
  validateCsrf(req);

  // 2. Extract and validate session
  const session = await getSessionContext(req);
  if (!session) {
    throw new AppError('UNAUTHORIZED', 'Authentication required to access this resource', 401);
  }

  return session;
}

/**
 * Require a specific row-based permission action (Rule 2)
 */
export function requirePermission(session: SessionContext, action: string): void {
  // OWNER has blanket access
  if (session.role === 'OWNER') {
    return;
  }

  // Row-based permission check
  const hasPermission = session.permissions.includes(action);
  if (!hasPermission) {
    throw new AppError(
      'FORBIDDEN',
      `Permission denied: You do not have the required permission '${action}'`,
      403
    );
  }
}

/**
 * Enforce rule: Admin cannot modify Owner [F1.2]
 */
export function assertCanModifyUser(
  caller: SessionContext,
  targetUser: { id: string; role: string }
): void {
  if (caller.userId === targetUser.id) {
    return; // Can edit own profile
  }

  if (targetUser.role === 'OWNER' && caller.role !== 'OWNER') {
    throw new AppError(
      'FORBIDDEN_OWNER_IMMUTABLE',
      'Administrative users cannot modify or remove the workspace Owner',
      403
    );
  }

  if (caller.role === 'USER') {
    throw new AppError('FORBIDDEN', 'Standard users cannot manage other team members', 403);
  }
}

/**
 * Server-side masking of opportunity value (F1.4)
 * Value is masked or hidden unless user has the permission 'crm.opportunity_value' or is OWNER
 */
export function maskOpportunityForUser<T extends { value?: number | null }>(
  item: T,
  session: SessionContext
): T {
  const canSeeValue = session.role === 'OWNER' || session.permissions.includes('crm.opportunity_value');

  if (!canSeeValue && 'value' in item) {
    return {
      ...item,
      value: null,
      _valueMasked: true,
    };
  }

  return item;
}

export function maskOpportunityList<T extends { value?: number | null }>(
  items: T[],
  session: SessionContext
): T[] {
  return items.map((item) => maskOpportunityForUser(item, session));
}
