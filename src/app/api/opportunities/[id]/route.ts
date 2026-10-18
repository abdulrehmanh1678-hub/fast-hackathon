import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission, maskOpportunityForUser } from '@/server/auth/rbac';
import { createScopedDAL } from '@/server/dal';
import { OpportunityUpdateSchema } from '@/shared/schemas';
import { recordAuditEvent } from '@/server/audit/audit-helper';
import { handleApiError, AppError } from '@/shared/errors';
import { prisma } from '@/server/db';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'crm.view');

    const dal = createScopedDAL(session.workspaceId);
    const opp = await dal.getOpportunityById(params.id);
    if (!opp) throw new AppError('NOT_FOUND', 'Opportunity not found', 404);

    const maskedOpp = maskOpportunityForUser(opp, session);

    return NextResponse.json({ opportunity: maskedOpp });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'crm.edit');

    const body = await req.json();
    const input = OpportunityUpdateSchema.parse(body);

    const dal = createScopedDAL(session.workspaceId);
    const existing = await dal.getOpportunityById(params.id);
    if (!existing) throw new AppError('NOT_FOUND', 'Opportunity not found', 404);

    // Update with optimistic concurrency check (Q4) and stage required fields validation (F2.4)
    const updatedOpp = await dal.updateOpportunityWithConcurrency(params.id, input);

    // If stage was changed, log an activity (F2.7)
    if (input.stageId && input.stageId !== existing.stageId) {
      await prisma.activity.create({
        data: {
          workspaceId: session.workspaceId,
          opportunityId: params.id,
          contactId: updatedOpp.contactId,
          actorId: session.userId,
          type: 'STAGE_CHANGE',
          description: `Stage moved from '${existing.stage?.name}' to '${(updatedOpp as any).stage?.name ?? 'new stage'}'`,
          metadata: {
            fromStageId: existing.stageId,
            toStageId: updatedOpp.stageId,
          },
        },
      });
    }

    // Audit log (F4.1)
    await recordAuditEvent({
      workspaceId: session.workspaceId,
      actorId: session.userId,
      eventType: 'OPPORTUNITY_UPDATED',
      targetType: 'opportunity',
      targetId: params.id,
      beforeValue: { stageId: existing.stageId, value: existing.value, title: existing.title, version: existing.version },
      afterValue: { stageId: updatedOpp.stageId, value: updatedOpp.value, title: updatedOpp.title, version: updatedOpp.version },
    });

    const masked = maskOpportunityForUser(updatedOpp, session);

    return NextResponse.json({ success: true, opportunity: masked });
  } catch (err) {
    return handleApiError(err);
  }
}
