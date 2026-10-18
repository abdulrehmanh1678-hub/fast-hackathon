import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission, maskOpportunityList } from '@/server/auth/rbac';
import { createScopedDAL } from '@/server/dal';
import { OpportunityCreateSchema } from '@/shared/schemas';
import { recordAuditEvent } from '@/server/audit/audit-helper';
import { handleApiError } from '@/shared/errors';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'crm.view');

    const stageId = req.nextUrl.searchParams.get('stageId') || undefined;
    const dal = createScopedDAL(session.workspaceId);
    const opportunities = await dal.getOpportunities(stageId);

    // Server-side masking of opportunity value (F1.4)
    const maskedOpportunities = maskOpportunityList(opportunities, session);

    return NextResponse.json({ opportunities: maskedOpportunities });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'crm.create');

    const body = await req.json();
    const input = OpportunityCreateSchema.parse(body);

    const dal = createScopedDAL(session.workspaceId);
    const opp = await dal.createOpportunity(input);

    await recordAuditEvent({
      workspaceId: session.workspaceId,
      actorId: session.userId,
      eventType: 'OPPORTUNITY_CREATED',
      targetType: 'opportunity',
      targetId: opp.id,
      afterValue: { title: opp.title, stageId: opp.stageId, value: opp.value },
    });

    return NextResponse.json({ success: true, opportunity: opp }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
