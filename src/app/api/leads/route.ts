import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/server/auth/rbac';
import { createScopedDAL } from '@/server/dal';
import { LeadCreateManualSchema } from '@/shared/schemas';
import { createAndAssignLead } from '@/server/lead-engine/assignment';
import { handleApiError } from '@/shared/errors';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'crm.view');

    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get('status') || undefined;
    const ownerId = searchParams.get('ownerId') || (session.role === 'USER' ? session.userId : undefined);
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0;

    const dal = createScopedDAL(session.workspaceId);
    const result = await dal.getLeads({ status, ownerId, limit, offset });

    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'crm.create');

    const body = await req.json();
    const input = LeadCreateManualSchema.parse(body);

    const lead = await createAndAssignLead({
      workspaceId: session.workspaceId,
      title: input.title,
      source: 'manual',
      contactId: input.contactId ?? null,
      specificOwnerId: input.ownerId ?? null,
      customFields: input.customFields ?? {},
    });

    return NextResponse.json({ success: true, lead }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
