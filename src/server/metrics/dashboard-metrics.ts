import { prisma } from '@/server/db';
import { SessionContext } from '@/shared/types';
import { createScopedDAL } from '@/server/dal';

/**
 * SINGLE SHARED DEFINITIONS MODULE FOR ALL METRICS (F5, Q12)
 * Ensures dashboard metrics, drill-downs, and list views ALWAYS agree.
 */

export interface DashboardMetricsResult {
  newLeadsToday: number;
  openPipelineValueByStage: Array<{
    stageId: string;
    stageName: string;
    totalValue: number | null; // null if masked
    opportunityCount: number;
  }>;
  totalOpenPipelineValue: number | null;
  averageTimeToFirstResponseSeconds: number | null;
  recoveryQueueCount: number;
  escalationsLast24Hours: number;
  employeeAvailability: {
    available: number;
    busy: number;
    onLeave: number;
    offline: number;
    availableEmployeesList: Array<{ id: string; name: string; openLeads: number; maxOpenLeads: number }>;
  };
  upcomingAppointmentsCount: number;
  paymentsReceivedThisMonth: {
    collectedRevenue: number;
    projectedRevenue: number;
    currency: string;
  };
  isPersonalScope: boolean;
}

/**
 * Computes all operational dashboard metrics (F5.1 - F5.4)
 */
export async function getDashboardMetrics(session: SessionContext): Promise<DashboardMetricsResult> {
  const { workspaceId, userId, role, permissions } = session;
  const isPersonalScope = role === 'USER';
  const canSeeValue = role === 'OWNER' || permissions.includes('crm.opportunity_value');

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 3600 * 1000);

  const dal = createScopedDAL(workspaceId);

  // 1. New Leads Today
  const leadWhere: any = {
    workspaceId,
    createdAt: { gte: startOfToday },
    ...(isPersonalScope ? { ownerId: userId } : {}),
  };
  const newLeadsToday = await prisma.lead.count({ where: leadWhere });

  // 2. Open Pipeline Value By Stage (Opportunities not in won or lost stages)
  const openStages = await prisma.stage.findMany({
    where: {
      workspaceId,
      isWon: false,
      isLost: false,
    },
    include: {
      opportunities: {
        where: isPersonalScope ? { ownerId: userId } : undefined,
        select: { value: true },
      },
    },
    orderBy: { order: 'asc' },
  });

  let totalOpenPipelineVal = 0;
  const openPipelineValueByStage = openStages.map((stage) => {
    const oppCount = stage.opportunities.length;
    const stageSum = stage.opportunities.reduce((acc, o) => acc + (o.value || 0), 0);
    totalOpenPipelineVal += stageSum;

    return {
      stageId: stage.id,
      stageName: stage.name,
      totalValue: canSeeValue ? stageSum : null,
      opportunityCount: oppCount,
    };
  });

  // 3. Average Time to First Response (Seconds from assignedAt to acknowledgedAt)
  const acknowledgedLeads = await prisma.lead.findMany({
    where: {
      workspaceId,
      acknowledgedAt: { not: null },
      assignedAt: { not: null },
      ...(isPersonalScope ? { ownerId: userId } : {}),
    },
    select: { assignedAt: true, acknowledgedAt: true },
    take: 100,
  });

  let averageTimeToFirstResponseSeconds: number | null = null;
  if (acknowledgedLeads.length > 0) {
    const totalResponseTimeMs = acknowledgedLeads.reduce((acc, l) => {
      const diff = l.acknowledgedAt!.getTime() - l.assignedAt!.getTime();
      return acc + (diff > 0 ? diff : 0);
    }, 0);
    averageTimeToFirstResponseSeconds = Math.round(totalResponseTimeMs / acknowledgedLeads.length / 1000);
  }

  // 4. Recovery Queue items
  const recoveryItems = await dal.getRecoveryQueue(24);
  const recoveryQueueCount = isPersonalScope
    ? recoveryItems.filter((i) => i.ownerId === userId).length
    : recoveryItems.length;

  // 5. Escalations in the last 24 hours
  const escalationsLast24Hours = await prisma.activity.count({
    where: {
      workspaceId,
      type: 'ESCALATION',
      createdAt: { gte: twentyFourHoursAgo },
      ...(isPersonalScope ? { lead: { ownerId: userId } } : {}),
    },
  });

  // 6. Employee Availability (Company-wide)
  const allUsers = await prisma.user.findMany({
    where: { workspaceId },
    include: {
      _count: {
        select: { assignedLeads: { where: { status: { in: ['NEW', 'ASSIGNED', 'ESCALATED'] } } } },
      },
    },
  });

  const employeeAvailability = {
    available: allUsers.filter((u) => u.availabilityStatus === 'AVAILABLE').length,
    busy: allUsers.filter((u) => u.availabilityStatus === 'BUSY').length,
    onLeave: allUsers.filter((u) => u.availabilityStatus === 'ON_LEAVE').length,
    offline: allUsers.filter((u) => u.availabilityStatus === 'OFFLINE').length,
    availableEmployeesList: allUsers
      .filter((u) => u.availabilityStatus === 'AVAILABLE' && u._count.assignedLeads < u.maxOpenLeads)
      .map((u) => ({
        id: u.id,
        name: u.name,
        openLeads: u._count.assignedLeads,
        maxOpenLeads: u.maxOpenLeads,
      })),
  };

  // 7. Upcoming Appointments
  const upcomingAppointmentsCount = await prisma.appointment.count({
    where: {
      workspaceId,
      status: { not: 'CANCELLED' },
      startTime: { gte: now },
      ...(isPersonalScope ? { hostUserId: userId } : {}),
    },
  });

  // 8. Payments received this month: Collected vs Projected revenue (I2.6)
  // Collected revenue = SUM(payments status=PAID confirmed by webhook) - SUM(REFUNDED)
  const paidPayments = await prisma.payment.findMany({
    where: {
      workspaceId,
      status: 'PAID',
      updatedAt: { gte: startOfMonth },
    },
    select: { amount: true },
  });

  const refundedPayments = await prisma.payment.findMany({
    where: {
      workspaceId,
      status: 'REFUNDED',
      updatedAt: { gte: startOfMonth },
    },
    select: { amount: true },
  });

  const collectedRevenue =
    paidPayments.reduce((acc, p) => acc + p.amount, 0) -
    refundedPayments.reduce((acc, p) => acc + p.amount, 0);

  // Projected revenue = open opportunities value + pending payment requests
  const pendingPayments = await prisma.payment.findMany({
    where: {
      workspaceId,
      status: 'PENDING',
    },
    select: { amount: true },
  });
  const pendingPaymentsSum = pendingPayments.reduce((acc, p) => acc + p.amount, 0);
  const projectedRevenue = totalOpenPipelineVal + pendingPaymentsSum;

  return {
    newLeadsToday,
    openPipelineValueByStage,
    totalOpenPipelineValue: canSeeValue ? totalOpenPipelineVal : null,
    averageTimeToFirstResponseSeconds,
    recoveryQueueCount,
    escalationsLast24Hours,
    employeeAvailability,
    upcomingAppointmentsCount,
    paymentsReceivedThisMonth: {
      collectedRevenue: canSeeValue ? Math.max(0, collectedRevenue) : 0,
      projectedRevenue: canSeeValue ? projectedRevenue : 0,
      currency: 'USD',
    },
    isPersonalScope,
  };
}

/**
 * Drill-down data endpoint (F5.3)
 * Supports drilling down into:
 * - "new_leads_today"
 * - "recovery_queue"
 * - "stage_opportunities"
 * - "upcoming_appointments"
 * - "recent_payments"
 */
export async function getDrillDownRecords(session: SessionContext, metric: string, stageId?: string) {
  const { workspaceId, userId, role } = session;
  const isPersonalScope = role === 'USER';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (metric) {
    case 'new_leads_today': {
      return prisma.lead.findMany({
        where: {
          workspaceId,
          createdAt: { gte: startOfToday },
          ...(isPersonalScope ? { ownerId: userId } : {}),
        },
        include: { contact: true, owner: true },
        orderBy: { createdAt: 'desc' },
      });
    }

    case 'recovery_queue': {
      const dal = createScopedDAL(workspaceId);
      const items = await dal.getRecoveryQueue(24);
      return isPersonalScope ? items.filter((i) => i.ownerId === userId) : items;
    }

    case 'stage_opportunities': {
      return prisma.opportunity.findMany({
        where: {
          workspaceId,
          ...(stageId ? { stageId } : {}),
          ...(isPersonalScope ? { ownerId: userId } : {}),
        },
        include: { stage: true, contact: true },
        orderBy: { createdAt: 'desc' },
      });
    }

    case 'upcoming_appointments': {
      return prisma.appointment.findMany({
        where: {
          workspaceId,
          status: { not: 'CANCELLED' },
          startTime: { gte: now },
          ...(isPersonalScope ? { hostUserId: userId } : {}),
        },
        include: { contact: true, hostUser: true },
        orderBy: { startTime: 'asc' },
      });
    }

    case 'recent_payments': {
      return prisma.payment.findMany({
        where: { workspaceId },
        include: { opportunity: true, contact: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    }

    default:
      return [];
  }
}
