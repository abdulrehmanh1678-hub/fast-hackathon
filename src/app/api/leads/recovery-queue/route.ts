import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/server/auth/rbac';
import { createScopedDAL } from '@/server/dal';
import { handleApiError } from '@/shared/errors';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'crm.view');

    const idleHours = req.nextUrl.searchParams.get('idleHours')
      ? parseInt(req.nextUrl.searchParams.get('idleHours')!)
      : 24;

    const dal = createScopedDAL(session.workspaceId);
    // Returns leads with individual recovery reasons (F3.7)
    const items = await dal.getRecoveryQueue(idleHours);

    // If User, filter to their own assigned leads (role aware)
    const filtered = session.role === 'USER' ? items.filter((i) => i.ownerId === session.userId) : items;

    return NextResponse.json({
      total: filtered.length,
      items: filtered,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
