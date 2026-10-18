import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/server/auth/rbac';
import { createScopedDAL } from '@/server/dal';
import { ActivityCreateSchema } from '@/shared/schemas';
import { handleApiError } from '@/shared/errors';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'crm.view');

    const searchParams = req.nextUrl.searchParams;
    const contactId = searchParams.get('contactId') || undefined;
    const opportunityId = searchParams.get('opportunityId') || undefined;
    const leadId = searchParams.get('leadId') || undefined;

    const dal = createScopedDAL(session.workspaceId);
    const activities = await dal.getActivities({ contactId, opportunityId, leadId });

    return NextResponse.json({ activities });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'crm.create');

    const body = await req.json();
    const input = ActivityCreateSchema.parse(body);

    const dal = createScopedDAL(session.workspaceId);
    const activity = await dal.createActivity({
      ...input,
      actorId: session.userId,
    });

    return NextResponse.json({ success: true, activity }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
