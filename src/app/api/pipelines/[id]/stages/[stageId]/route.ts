import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/server/auth/rbac';
import { createScopedDAL } from '@/server/dal';
import { recordAuditEvent } from '@/server/audit/audit-helper';
import { handleApiError } from '@/shared/errors';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; stageId: string } }
) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'crm.delete');

    const dal = createScopedDAL(session.workspaceId);
    // Safe delete: will throw STAGE_NOT_EMPTY if stage holds any opportunities (F2.5)
    const deletedStage = await dal.deleteStageSafe(params.stageId);

    await recordAuditEvent({
      workspaceId: session.workspaceId,
      actorId: session.userId,
      eventType: 'STAGE_DELETED',
      targetType: 'stage',
      targetId: params.stageId,
      beforeValue: { name: deletedStage.name },
    });

    return NextResponse.json({ success: true, message: `Stage '${deletedStage.name}' safely deleted` });
  } catch (err) {
    return handleApiError(err);
  }
}
