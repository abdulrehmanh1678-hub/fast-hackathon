import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/server/auth/rbac';
import { checkFreeBusy } from '@/server/integrations/google-calendar';
import { handleApiError, AppError } from '@/shared/errors';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);

    const timeMin = req.nextUrl.searchParams.get('timeMin');
    const timeMax = req.nextUrl.searchParams.get('timeMax');
    const timeZone = req.nextUrl.searchParams.get('timeZone') || 'UTC';

    if (!timeMin || !timeMax) {
      throw new AppError('MISSING_PARAMS', 'timeMin and timeMax are required parameters', 400);
    }

    const freeBusy = await checkFreeBusy({
      workspaceId: session.workspaceId,
      timeMin,
      timeMax,
      timeZone,
    });

    return NextResponse.json(freeBusy);
  } catch (err) {
    return handleApiError(err);
  }
}
