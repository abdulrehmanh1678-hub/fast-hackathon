import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/server/auth/rbac';
import { getGoogleAuthUrl } from '@/server/integrations/google-calendar';
import { handleApiError } from '@/shared/errors';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'integrations.manage');

    const authUrl = getGoogleAuthUrl(session.workspaceId, session.userId);

    return NextResponse.json({ authUrl });
  } catch (err) {
    return handleApiError(err);
  }
}
