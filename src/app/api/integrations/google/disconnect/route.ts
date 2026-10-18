import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/server/auth/rbac';
import { disconnectGoogleCalendar } from '@/server/integrations/google-calendar';
import { handleApiError } from '@/shared/errors';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'integrations.manage');

    await disconnectGoogleCalendar(session.workspaceId, session.userId);

    return NextResponse.json({ success: true, message: 'Google Calendar disconnected successfully' });
  } catch (err) {
    return handleApiError(err);
  }
}
