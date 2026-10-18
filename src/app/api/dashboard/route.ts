import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/server/auth/rbac';
import { getDashboardMetrics } from '@/server/metrics/dashboard-metrics';
import { handleApiError } from '@/shared/errors';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);

    // ONE shared definitions module for all metric calculations (F5.1 - F5.4, Q12)
    const metrics = await getDashboardMetrics(session);

    return NextResponse.json(metrics);
  } catch (err) {
    return handleApiError(err);
  }
}
