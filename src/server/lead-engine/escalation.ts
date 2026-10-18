import { prisma } from '@/server/db';
import { recordAuditEvent } from '@/server/audit/audit-helper';
import { activeNotificationProvider } from '@/server/integrations/notification-provider';
import { broadcastSSEEvent } from '@/server/lead-engine/sse';
import { findNextEligibleAssignee } from '@/server/lead-engine/assignment';

/**
 * Find the next assignee in the escalation chain (F3.5):
 * Level 1: Next eligible available peer
 * Level 2: An available Admin (backup)
 * Level 3+: The workspace Owner (manager of last resort)
 */
async function findEscalationTarget(workspaceId: string, currentOwnerId?: string | null, nextLevel = 1) {
  // If next level is 1 or 2, look for next eligible peer or admin
  if (nextLevel === 1) {
    const peer = await findNextEligibleAssignee({
      workspaceId,
      excludeUserId: currentOwnerId ?? undefined,
    });
    if (peer) return peer;
  }

  if (nextLevel <= 2) {
    // Look for an available Admin
    const admin = await prisma.user.findFirst({
      where: {
        workspaceId,
        role: 'ADMIN',
        availabilityStatus: 'AVAILABLE',
        ...(currentOwnerId ? { id: { not: currentOwnerId } } : {}),
      },
      include: {
        _count: {
          select: { assignedLeads: { where: { status: { in: ['NEW', 'ASSIGNED', 'ESCALATED'] } } } },
        },
      },
    });
    if (admin) return admin;
  }

  // Fallback to Owner
  const owner = await prisma.user.findFirst({
    where: {
      workspaceId,
      role: 'OWNER',
    },
    include: {
      _count: {
        select: { assignedLeads: { where: { status: { in: ['NEW', 'ASSIGNED', 'ESCALATED'] } } } },
      },
    },
  });

  return owner;
}

/**
 * Reassign an individual lead due to expiration or absence (F3.5, F3.6, Rule 3)
 */
export async function reassignLead(params: {
  workspaceId: string;
  leadId: string;
  reason: string;
  isEscalation?: boolean;
}) {
  const { workspaceId, leadId, reason, isEscalation = false } = params;

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, workspaceId },
    include: { owner: true },
  });

  if (!lead) return null;

  const nextLevel = isEscalation ? lead.escalationLevel + 1 : lead.escalationLevel;
  const newOwner = await findEscalationTarget(workspaceId, lead.ownerId, nextLevel);

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
  });
  const settings = (workspace?.settings as Record<string, any>) || {};
  const ackWindowSeconds = Number(settings.ackWindowSeconds || 300);

  const now = new Date();
  const nextAckDeadline = new Date(now.getTime() + ackWindowSeconds * 1000);

  const updatedLead = await prisma.lead.update({
    where: { id: leadId },
    data: {
      ownerId: newOwner?.id ?? null,
      status: 'ESCALATED',
      assignedAt: now,
      ackDeadline: nextAckDeadline,
      escalationLevel: nextLevel,
      lastEscalatedAt: isEscalation ? now : lead.lastEscalatedAt,
      version: { increment: 1 },
    },
    include: { owner: true, contact: true },
  });

  // Record activity
  await prisma.activity.create({
    data: {
      workspaceId,
      leadId,
      contactId: lead.contactId,
      type: isEscalation ? 'ESCALATION' : 'REASSIGNMENT',
      description: `Lead reassigned from ${lead.owner?.name ?? 'Unassigned'} to ${
        newOwner?.name ?? 'Recovery Queue'
      } (${reason}). Ack window: ${ackWindowSeconds}s.`,
      metadata: {
        previousOwnerId: lead.ownerId,
        newOwnerId: newOwner?.id,
        escalationLevel: nextLevel,
        reason,
      },
    },
  });

  // Audit event (F4.1)
  await recordAuditEvent({
    workspaceId,
    actorId: null, // System event
    eventType: isEscalation ? 'LEAD_ESCALATED' : 'LEAD_REASSIGNED',
    targetType: 'lead',
    targetId: lead.id,
    beforeValue: { ownerId: lead.ownerId, escalationLevel: lead.escalationLevel },
    afterValue: { ownerId: newOwner?.id, escalationLevel: nextLevel, reason },
  });

  // External Notification (F3.9, I4.1, I4.2)
  if (newOwner && newOwner.telegramDestination) {
    const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
    await activeNotificationProvider.sendEscalationAlert({
      workspaceId,
      leadId: lead.id,
      leadTitle: lead.title,
      source: lead.source,
      escalationLevel: nextLevel,
      reason,
      assigneeId: newOwner.id,
      assigneeName: newOwner.name,
      destination: newOwner.telegramDestination,
      leadUrl: `${baseUrl}/leads/${lead.id}`,
    });
  }

  // Real-time SSE event (Q11)
  broadcastSSEEvent(workspaceId, 'LEAD_ESCALATED', {
    leadId: lead.id,
    title: lead.title,
    previousOwner: lead.owner?.name,
    newOwner: newOwner?.name ?? 'Unassigned',
    escalationLevel: nextLevel,
    reason,
  });

  return updatedLead;
}

/**
 * Immediate reassignment of unacknowledged leads when an employee goes ON_LEAVE or OFFLINE (F3.6)
 * DECISION DOCUMENTATION:
 * - Unacknowledged leads are immediately reassigned so customer intake is not stalled.
 * - Acknowledged leads remain assigned to the employee so continuity is maintained,
 *   with an absence status banner displayed on the contact record.
 */
export async function reassignUnacknowledgedLeadsForUser(workspaceId: string, userId: string) {
  const pendingLeads = await prisma.lead.findMany({
    where: {
      workspaceId,
      ownerId: userId,
      acknowledgedAt: null,
      status: { in: ['ASSIGNED', 'ESCALATED', 'NEW'] },
    },
  });

  for (const lead of pendingLeads) {
    await reassignLead({
      workspaceId,
      leadId: lead.id,
      reason: 'Employee changed status to On Leave / Offline',
      isEscalation: false,
    });
  }

  return pendingLeads.length;
}

/**
 * Atomic escalation check using FOR UPDATE SKIP LOCKED (Rule 3, Rule 5, F3.8, Q5)
 * Safe against race conditions and surviving restarts.
 */
export async function processExpiredLeadsBatch(limit = 10): Promise<number> {
  const now = new Date();

  // Run raw query with FOR UPDATE SKIP LOCKED on PostgreSQL
  const expiredLeads = await prisma.$queryRaw<Array<{ id: string; workspace_id: string }>>`
    SELECT id, workspace_id
    FROM "leads"
    WHERE status IN ('ASSIGNED', 'ESCALATED')
      AND acknowledged_at IS NULL
      AND ack_deadline IS NOT NULL
      AND ack_deadline <= ${now}
    ORDER BY ack_deadline ASC
    LIMIT ${limit}
    FOR UPDATE SKIP LOCKED;
  `;

  if (!expiredLeads || expiredLeads.length === 0) {
    return 0;
  }

  let processedCount = 0;
  for (const row of expiredLeads) {
    try {
      await reassignLead({
        workspaceId: row.workspace_id,
        leadId: row.id,
        reason: 'Acknowledgement window expired',
        isEscalation: true,
      });
      processedCount++;
    } catch (err) {
      console.error(`Error escalating lead ${row.id}:`, err);
    }
  }

  return processedCount;
}
