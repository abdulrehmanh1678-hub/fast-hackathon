import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/server/auth/rbac';
import { createScopedDAL } from '@/server/dal';
import { SavedListCreateSchema } from '@/shared/schemas';
import { handleApiError } from '@/shared/errors';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'crm.view');

    const dal = createScopedDAL(session.workspaceId);
    const savedLists = await dal.getSavedLists(session.userId);

    return NextResponse.json({ savedLists });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'crm.view');

    const body = await req.json();
    const input = SavedListCreateSchema.parse(body);

    const dal = createScopedDAL(session.workspaceId);
    const savedList = await dal.createSavedList(session.userId, input);

    return NextResponse.json({ success: true, savedList }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
