import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, assertCanModifyUser } from '@/server/auth/rbac';
import { createScopedDAL } from '@/server/dal';
import { PermissionUpdateSchema } from '@/shared/schemas';
import { recordAuditEvent } from '@/server/audit/audit-helper';
import { handleApiError, AppError } from '@/shared/errors';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAuth(req);
    const targetUserId = params.id;

    const dal = createScopedDAL(session.workspaceId);
    const permissions = await dal.getUserPermissions(targetUserId);

    return NextResponse.json({ userId: targetUserId, permissions });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAuth(req);
    const targetUserId = params.id;

    // Only OWNER or ADMIN can modify permissions
    if (session.role === 'USER') {
      throw new AppError('FORBIDDEN', 'Permission denied: Cannot edit team member permissions', 403);
    }

    const dal = createScopedDAL(session.workspaceId);
    const targetUser = await dal.getUserById(targetUserId);
    if (!targetUser) throw new AppError('NOT_FOUND', 'Target user not found', 404);

    // Rule: Admin cannot modify Owner (F1.2)
    assertCanModifyUser(session, targetUser);

    const body = await req.json();
    const input = PermissionUpdateSchema.parse(body);

    const prevPermissions = await dal.getUserPermissions(targetUserId);
    const updatedPermissions = await dal.setUserPermissions(targetUserId, input.permissions);

    // Audit log (F4.1)
    await recordAuditEvent({
      workspaceId: session.workspaceId,
      actorId: session.userId,
      eventType: 'PERMISSION_CHANGED',
      targetType: 'user',
      targetId: targetUserId,
      beforeValue: { permissions: prevPermissions },
      afterValue: { permissions: input.permissions },
    });

    return NextResponse.json({
      success: true,
      userId: targetUserId,
      permissions: updatedPermissions.map((p) => p.action),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
