import { prisma } from '@/server/db';
import { AppError } from '@/shared/errors';
import { recordAuditEvent } from '@/server/audit/audit-helper';
import { broadcastSSEEvent } from '@/server/lead-engine/sse';

export interface AssignLeadOptions {
  workspaceId: string;
  excludeUserId?: string;
  specificUserId?: string;
}

/**
 * Finds the next eligible user using Round-Robin distribution (F3.3)
 * Rules:
 * 1. User MUST have availabilityStatus === 'AVAILABLE' (Busy, On leave, Offline NEVER get leads)
 * 2. User MUST have fewer open leads than their maxOpenLeads
 * 3. User with oldest last lead assignment or fewest leads receives next lead (Round Robin)
 */
export async function findNextEligibleAssignee(options: AssignLeadOptions) {
  const { workspaceId, excludeUserId, specificUserId } = options;

  if (specificUserId) {
    const user = await prisma.user.findFirst({
      where: {
        id: specificUserId,
        workspaceId,
        availabilityStatus: 'AVAILABLE',
      },
      include: {
        _count: {
          select: {
            assignedLeads: {
              where: { status: { in: ['NEW', 'ASSIGNED', 'ESCALATED'] } },
            },
          },
        },
      },
    });

    if (user && user._count.assignedLeads < user.maxOpenLeads) {
      return user;
    }
    // If specific user not eligible, fall through to round robin
  }

  // Fetch all Available employees in workspace
  const availableUsers = await prisma.user.findMany({
    where: {
      workspaceId,
      availabilityStatus: 'AVAILABLE',
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    include: {
      _count: {
        select: {
          assignedLeads: {
            where: { status: { in: ['NEW', 'ASSIGNED', 'ESCALATED'] } },
          },
        },
      },
      assignedLeads: {
        orderBy: { assignedAt: 'desc' },
        take: 1,
        select: { assignedAt: true },
      },
    },
  });

  // Filter out users who have reached their max open leads capacity
  const eligibleUsers = availableUsers.filter((u) => u._count.assignedLeads < u.maxOpenLeads);

  if (eligibleUsers.length === 0) {
    return null; // All reps at capacity or unavailable
  }

  // Sort by: 1) fewest open leads, 2) least recently assigned
  eligibleUsers.sort((a, b) => {
    if (a._count.assignedLeads !== b._count.assignedLeads) {
      return a._count.assignedLeads - b._count.assignedLeads;
    }
    const aLast = a.assignedLeads[0]?.assignedAt?.getTime() || 0;
    const bLast = b.assignedLeads[0]?.assignedAt?.getTime() || 0;
    return aLast - bLast;
  });

  return eligibleUsers[0];
}

/**
 * Creates and automatically assigns a lead from an intake source (F3.1)
 */
export async function createAndAssignLead(params: {
  workspaceId: string;
  title: string;
  source: 'web_form' | 'messaging' | 'manual';
  contactId?: string | null;
  specificOwnerId?: string | null;
  customFields?: Record<string, any>;
}) {
  const { workspaceId, title, source, contactId, specificOwnerId, customFields } = params;

  // Retrieve workspace settings for ack window
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
  });

  const settings = (workspace?.settings as Record<string, any>) || {};
  const ackWindowSeconds = Number(settings.ackWindowSeconds || 300); // Default 5 minutes (300s)

  const assignee = await findNextEligibleAssignee({
    workspaceId,
    specificUserId: specificOwnerId ?? undefined,
  });

  const now = new Date();
  const ackDeadline = assignee ? new Date(now.getTime() + ackWindowSeconds * 1000) : null;
  const status = assignee ? 'ASSIGNED' : 'NEW';

  const lead = await prisma.lead.create({
    data: {
      workspaceId,
      title,
      source,
      contactId: contactId ?? null,
      ownerId: assignee?.id ?? null,
      status,
      assignedAt: assignee ? now : null,
      ackDeadline,
      escalationLevel: 0,
      customFields: customFields ?? {},
      version: 1,
    },
    include: {
      contact: true,
      owner: true,
    },
  });

  // Log activity
  await prisma.activity.create({
    data: {
      workspaceId,
      leadId: lead.id,
      contactId: contactId ?? null,
      type: 'ASSIGNMENT',
      description: assignee
        ? `Lead automatically assigned to ${assignee.name} via round-robin (ack deadline: ${ackWindowSeconds}s)`
        : 'Lead created unassigned (no available employees with capacity)',
      metadata: {
        source,
        assigneeId: assignee?.id,
        ackDeadline,
      },
    },
  });

  // Audit log (F4.1)
  await recordAuditEvent({
    workspaceId,
    actorId: null, // System event
    eventType: 'LEAD_CREATED',
    targetType: 'lead',
    targetId: lead.id,
    afterValue: {
      title: lead.title,
      source: lead.source,
      ownerId: lead.ownerId,
      status: lead.status,
    },
  });

  // Broadcast real-time SSE event (Q11)
  broadcastSSEEvent(workspaceId, 'LEAD_CREATED', {
    leadId: lead.id,
    title: lead.title,
    source: lead.source,
    ownerName: assignee?.name ?? 'Unassigned',
    ackDeadline: lead.ackDeadline,
  });

  return lead;
}

/**
 * Acknowledge a lead (F3.4)
 * Any recorded action (note, call, message, stage change, appointment) or direct ack counts!
 */
export async function acknowledgeLead(params: {
  workspaceId: string;
  leadId: string;
  actorId: string;
  actionType?: string;
  note?: string;
}) {
  const { workspaceId, leadId, actorId, actionType = 'ACKNOWLEDGEMENT', note } = params;

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, workspaceId },
    include: { owner: true },
  });

  if (!lead) throw new AppError('NOT_FOUND', 'Lead not found', 404);

  // If already acknowledged, return lead
  if (lead.acknowledgedAt) {
    return lead;
  }

  const now = new Date();
  const updatedLead = await prisma.lead.update({
    where: { id: leadId },
    data: {
      status: 'ACKNOWLEDGED',
      acknowledgedAt: now,
      version: { increment: 1 },
    },
    include: { owner: true, contact: true },
  });

  // Create activity record
  await prisma.activity.create({
    data: {
      workspaceId,
      leadId,
      contactId: lead.contactId,
      actorId,
      type: 'ACKNOWLEDGEMENT',
      description: note || `Lead acknowledged by ${lead.owner?.name ?? 'agent'} via ${actionType}`,
      metadata: { actionType, acknowledgedAt: now },
    },
  });

  // Audit record (F4.1)
  await recordAuditEvent({
    workspaceId,
    actorId,
    eventType: 'LEAD_ACKNOWLEDGED',
    targetType: 'lead',
    targetId: lead.id,
    beforeValue: { status: lead.status, acknowledgedAt: null },
    afterValue: { status: 'ACKNOWLEDGED', acknowledgedAt: now },
  });

  // Broadcast SSE event
  broadcastSSEEvent(workspaceId, 'LEAD_ACKNOWLEDGED', {
    leadId: lead.id,
    acknowledgedAt: now,
  });

  return updatedLead;
}
