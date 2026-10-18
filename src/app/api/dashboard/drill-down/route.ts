import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/server/auth/rbac';
import { getDrillDownRecords } from '@/server/metrics/dashboard-metrics';
import { handleApiError, AppError } from '@/shared/errors';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);

    const metric = req.nextUrl.searchParams.get('metric');
    const stageId = req.nextUrl.searchParams.get('stageId') || undefined;

    if (!metric) {
      throw new AppError('METRIC_REQUIRED', "Metric query parameter is required (e.g. 'new_leads_today', 'recovery_queue', 'stage_opportunities', 'upcoming_appointments', 'recent_payments')", 400);
    }

    const records = await getDrillDownRecords(session, metric, stageId);

    return NextResponse.json({
      metric,
      count: records.length,
      records,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
