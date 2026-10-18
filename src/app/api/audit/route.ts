import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/server/auth/rbac';
import { getAuditLogs } from '@/server/audit/audit-helper';
import { handleApiError } from '@/shared/errors';

/**
 * Audit history view (F4.1, F4.2).
 * Strictly read-only: NO POST, PUT, PATCH, or DELETE methods exist on this endpoint (F4.3).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    // Restricted visibility: requires audit.view permission (F4.2)
    requirePermission(session, 'audit.view');

    const searchParams = req.nextUrl.searchParams;
    const eventType = searchParams.get('eventType') || undefined;
    const actorId = searchParams.get('actorId') || undefined;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0;

    const result = await getAuditLogs({
      workspaceId: session.workspaceId,
      eventType,
      actorId,
      startDate,
      endDate,
      limit,
      offset,
    });

    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
