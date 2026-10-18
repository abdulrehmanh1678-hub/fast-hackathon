import { prisma } from '@/server/db';

export interface AuditEventParams {
  workspaceId: string;
  actorId?: string | null; // null for system actions
  eventType: string; // ASSIGNMENT, ACKNOWLEDGEMENT, ESCALATION, REASSIGNMENT, ROLE_CHANGE, PERMISSION_CHANGE, FIELD_CONFIG, PIPELINE_CONFIG, INTEGRATION_CONFIG, DELETION
  targetType: string; // lead, user, opportunity, pipeline, stage, integration, etc.
  targetId?: string | null;
  beforeValue?: any;
  afterValue?: any;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Append-only audit logging helper (F4.1, F4.3).
 * NOTE: Intentionally, no update or delete function is implemented or exposed.
 */
export async function recordAuditEvent(params: AuditEventParams) {
  try {
    return await prisma.auditLog.create({
      data: {
        workspaceId: params.workspaceId,
        actorId: params.actorId ?? null,
        eventType: params.eventType,
        targetType: params.targetType,
        targetId: params.targetId ?? null,
        beforeValue: params.beforeValue ? JSON.parse(JSON.stringify(params.beforeValue)) : undefined,
        afterValue: params.afterValue ? JSON.parse(JSON.stringify(params.afterValue)) : undefined,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
  } catch (err) {
    // Log error to console, never fail the primary business operation if audit creation errors
    console.error('Failed to write audit log entry:', err);
    return null;
  }
}

export interface AuditFilterParams {
  workspaceId: string;
  eventType?: string;
  actorId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export async function getAuditLogs(filters: AuditFilterParams) {
  const where: any = {
    workspaceId: filters.workspaceId,
  };

  if (filters.eventType) {
    where.eventType = filters.eventType;
  }
  if (filters.actorId) {
    where.actorId = filters.actorId;
  }
  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) {
      where.createdAt.gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      where.createdAt.lte = new Date(filters.endDate);
    }
  }

  const limit = Math.min(filters.limit || 50, 100);
  const offset = filters.offset || 0;

  const [total, items] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
  ]);

  return { total, items, limit, offset };
}
