import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/server/auth/rbac';
import { createScopedDAL } from '@/server/dal';
import { StageCreateSchema } from '@/shared/schemas';
import { recordAuditEvent } from '@/server/audit/audit-helper';
import { handleApiError } from '@/shared/errors';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'crm.create');

    const pipelineId = params.id;
    const body = await req.json();
    const input = StageCreateSchema.parse(body);

    const dal = createScopedDAL(session.workspaceId);
    const stage = await dal.createStage(pipelineId, input);

    await recordAuditEvent({
      workspaceId: session.workspaceId,
      actorId: session.userId,
      eventType: 'STAGE_CREATED',
      targetType: 'stage',
      targetId: stage.id,
      afterValue: { name: stage.name, order: stage.order, requiredFields: stage.requiredFields },
    });

    return NextResponse.json({ success: true, stage }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
