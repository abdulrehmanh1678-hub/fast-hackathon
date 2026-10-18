import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/server/auth/rbac';
import { createScopedDAL } from '@/server/dal';
import { PipelineCreateSchema } from '@/shared/schemas';
import { recordAuditEvent } from '@/server/audit/audit-helper';
import { handleApiError } from '@/shared/errors';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'crm.view');

    const dal = createScopedDAL(session.workspaceId);
    const pipelines = await dal.getPipelines();

    return NextResponse.json({ pipelines });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'crm.create');

    const body = await req.json();
    const input = PipelineCreateSchema.parse(body);

    const dal = createScopedDAL(session.workspaceId);
    const pipeline = await dal.createPipeline(input.name, input.isDefault);

    await recordAuditEvent({
      workspaceId: session.workspaceId,
      actorId: session.userId,
      eventType: 'PIPELINE_CREATED',
      targetType: 'pipeline',
      targetId: pipeline.id,
      afterValue: { name: pipeline.name },
    });

    return NextResponse.json({ success: true, pipeline }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
