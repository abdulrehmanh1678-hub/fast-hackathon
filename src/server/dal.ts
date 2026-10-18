import { prisma } from '@/server/db';
import { AppError } from '@/shared/errors';
import {
  OpportunityCreateInput,
  OpportunityUpdateInput,
  ContactCreateInput,
  ContactUpdateInput,
} from '@/shared/schemas';

/**
 * Workspace-scoped Data Access Layer (DAL)
 * Enforces Rule 1: Every query MUST be filtered by workspaceId so that no user
 * can ever read or mutate records from another tenant even with guessed IDs [F1.6, Q2].
 */
export function createScopedDAL(workspaceId: string) {
  if (!workspaceId) {
    throw new AppError('WORKSPACE_REQUIRED', 'DAL requires a valid workspaceId', 500);
  }

  return {
    workspaceId,

    // =========================================================
    // WORKSPACE
    // =========================================================
    async getWorkspace() {
      return prisma.workspace.findUnique({
        where: { id: workspaceId },
      });
    },

    async updateWorkspaceSettings(settings: Record<string, any>) {
      return prisma.workspace.update({
        where: { id: workspaceId },
        data: { settings },
      });
    },

    // =========================================================
    // USERS & AVAILABILITY
    // =========================================================
    async getUsers() {
      return prisma.user.findMany({
        where: { workspaceId },
        include: { permissions: true },
        orderBy: { createdAt: 'asc' },
      });
    },

    async getUserById(userId: string) {
      return prisma.user.findFirst({
        where: { id: userId, workspaceId },
        include: { permissions: true },
      });
    },

    async updateUser(userId: string, data: any) {
      const user = await prisma.user.findFirst({
        where: { id: userId, workspaceId },
      });
      if (!user) throw new AppError('NOT_FOUND', 'User not found in workspace', 404);

      return prisma.user.update({
        where: { id: userId },
        data,
        include: { permissions: true },
      });
    },

    async getUserPermissions(userId: string) {
      const perms = await prisma.permission.findMany({
        where: { workspaceId, userId },
      });
      return perms.map((p) => p.action);
    },

    async setUserPermissions(userId: string, actions: string[]) {
      // Clear and reassign permissions for user
      return prisma.$transaction(async (tx) => {
        await tx.permission.deleteMany({
          where: { workspaceId, userId },
        });

        if (actions.length > 0) {
          await tx.permission.createMany({
            data: actions.map((action) => ({
              workspaceId,
              userId,
              action,
            })),
          });
        }

        return tx.permission.findMany({
          where: { workspaceId, userId },
        });
      });
    },

    // =========================================================
    // CONTACTS
    // =========================================================
    async getContacts(options?: { query?: string; limit?: number; offset?: number }) {
      const where: any = { workspaceId };
      if (options?.query) {
        where.OR = [
          { firstName: { contains: options.query, mode: 'insensitive' } },
          { lastName: { contains: options.query, mode: 'insensitive' } },
          { email: { contains: options.query, mode: 'insensitive' } },
          { phone: { contains: options.query } },
        ];
      }
      const limit = Math.min(options?.limit || 50, 100);
      const offset = options?.offset || 0;

      const [total, items] = await Promise.all([
        prisma.contact.count({ where }),
        prisma.contact.findMany({
          where,
          include: { company: true },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
      ]);
      return { total, items, limit, offset };
    },

    async getContactById(contactId: string) {
      return prisma.contact.findFirst({
        where: { id: contactId, workspaceId },
        include: {
          company: true,
          opportunities: { include: { stage: true } },
          leads: true,
          conversations: { include: { messages: { take: 20, orderBy: { createdAt: 'desc' } } } },
          appointments: true,
          payments: true,
          activities: { orderBy: { createdAt: 'desc' }, take: 50 },
        },
      });
    },

    async findContactByPhone(phone: string) {
      return prisma.contact.findFirst({
        where: { workspaceId, phone },
      });
    },

    async createContact(data: ContactCreateInput) {
      return prisma.contact.create({
        data: {
          workspaceId,
          companyId: data.companyId ?? null,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email ?? null,
          phone: data.phone ?? null,
          optOut: data.optOut ?? false,
        },
      });
    },

    async updateContact(contactId: string, data: ContactUpdateInput) {
      const existing = await prisma.contact.findFirst({
        where: { id: contactId, workspaceId },
      });
      if (!existing) throw new AppError('NOT_FOUND', 'Contact not found', 404);

      return prisma.contact.update({
        where: { id: contactId },
        data: {
          ...data,
          companyId: data.companyId !== undefined ? data.companyId : existing.companyId,
        },
      });
    },

    // =========================================================
    // COMPANIES
    // =========================================================
    async getCompanies() {
      return prisma.company.findMany({
        where: { workspaceId },
        include: { contacts: true, opportunities: true },
        orderBy: { name: 'asc' },
      });
    },

    async createCompany(data: { name: string; domain?: string; industry?: string; phone?: string }) {
      return prisma.company.create({
        data: {
          workspaceId,
          ...data,
        },
      });
    },

    // =========================================================
    // PIPELINES & STAGES
    // =========================================================
    async getPipelines() {
      return prisma.pipeline.findMany({
        where: { workspaceId },
        include: {
          stages: { orderBy: { order: 'asc' } },
          customFields: true,
        },
      });
    },

    async createPipeline(name: string, isDefault = false) {
      return prisma.pipeline.create({
        data: {
          workspaceId,
          name,
          isDefault,
        },
      });
    },

    async createStage(pipelineId: string, data: { name: string; order: number; isWon?: boolean; isLost?: boolean; requiredFields?: string[] }) {
      // Verify pipeline belongs to workspace
      const pipeline = await prisma.pipeline.findFirst({
        where: { id: pipelineId, workspaceId },
      });
      if (!pipeline) throw new AppError('NOT_FOUND', 'Pipeline not found', 404);

      return prisma.stage.create({
        data: {
          workspaceId,
          pipelineId,
          name: data.name,
          order: data.order,
          isWon: data.isWon ?? false,
          isLost: data.isLost ?? false,
          requiredFields: data.requiredFields ?? [],
        },
      });
    },

    async deleteStageSafe(stageId: string) {
      const stage = await prisma.stage.findFirst({
        where: { id: stageId, workspaceId },
        include: { opportunities: { select: { id: true } } },
      });
      if (!stage) throw new AppError('NOT_FOUND', 'Stage not found', 404);

      // Safe delete check: stage holding opportunities cannot be deleted (F2.5)
      if (stage.opportunities.length > 0) {
        throw new AppError(
          'STAGE_NOT_EMPTY',
          `Cannot delete stage '${stage.name}' because it holds ${stage.opportunities.length} open opportunities. Move them first.`,
          400
        );
      }

      return prisma.stage.delete({
        where: { id: stageId },
      });
    },

    // =========================================================
    // CUSTOM FIELDS
    // =========================================================
    async getCustomFields(pipelineId?: string) {
      return prisma.customField.findMany({
        where: {
          workspaceId,
          ...(pipelineId ? { pipelineId } : {}),
        },
      });
    },

    async createCustomField(data: any) {
      return prisma.customField.create({
        data: {
          workspaceId,
          pipelineId: data.pipelineId ?? null,
          name: data.name,
          key: data.key,
          type: data.type,
          options: data.options ?? null,
          isRequired: data.isRequired ?? false,
        },
      });
    },

    // =========================================================
    // OPPORTUNITIES (Optimistic Concurrency Q4 & Required Fields F2.4)
    // =========================================================
    async getOpportunities(stageId?: string) {
      return prisma.opportunity.findMany({
        where: {
          workspaceId,
          ...(stageId ? { stageId } : {}),
        },
        include: { stage: true, contact: true, company: true },
        orderBy: { createdAt: 'desc' },
      });
    },

    async getOpportunityById(oppId: string) {
      return prisma.opportunity.findFirst({
        where: { id: oppId, workspaceId },
        include: { stage: true, contact: true, company: true, activities: true, payments: true },
      });
    },

    async createOpportunity(data: OpportunityCreateInput) {
      // Validate stage belongs to workspace
      const stage = await prisma.stage.findFirst({
        where: { id: data.stageId, workspaceId },
      });
      if (!stage) throw new AppError('NOT_FOUND', 'Stage not found in workspace', 404);

      return prisma.opportunity.create({
        data: {
          workspaceId,
          title: data.title,
          value: data.value,
          currency: data.currency,
          stageId: data.stageId,
          contactId: data.contactId ?? null,
          companyId: data.companyId ?? null,
          ownerId: data.ownerId ?? null,
          customFields: (data.customFields as any) ?? {},
          version: 1,
        },
        include: { stage: true, contact: true },
      });
    },

    async updateOpportunityWithConcurrency(oppId: string, data: OpportunityUpdateInput) {
      const existing = await prisma.opportunity.findFirst({
        where: { id: oppId, workspaceId },
        include: { stage: true, contact: true },
      });
      if (!existing) throw new AppError('NOT_FOUND', 'Opportunity not found', 404);

      // Optimistic concurrency check (Q4)
      if (existing.version !== data.version) {
        throw new AppError(
          'CONFLICT_CONCURRENT_EDIT',
          `Conflict: This record was modified by another user (current version: ${existing.version}, provided: ${data.version}). Please refresh and try again.`,
          409
        );
      }

      // Check stage-required fields if moving to a new stage (F2.4)
      if (data.stageId && data.stageId !== existing.stageId) {
        const targetStage = await prisma.stage.findFirst({
          where: { id: data.stageId, workspaceId },
        });
        if (!targetStage) throw new AppError('NOT_FOUND', 'Target stage not found', 404);

        const requiredFields = (targetStage.requiredFields as string[]) || [];
        const combinedFields = {
          ...(existing.customFields as Record<string, any> || {}),
          ...(data.customFields || {}),
          title: data.title ?? existing.title,
          phone: existing.contact?.phone,
        };

        const missingFields = requiredFields.filter((reqField) => {
          const val = (combinedFields as any)[reqField];
          return val === undefined || val === null || val === '';
        });

        if (missingFields.length > 0) {
          throw new AppError(
            'STAGE_REQUIRED_FIELDS_MISSING',
            `Cannot move opportunity to '${targetStage.name}'. Required fields missing: ${missingFields.join(', ')}`,
            400,
            { missingFields }
          );
        }
      }

      return prisma.opportunity.update({
        where: { id: oppId },
        data: {
          title: data.title ?? existing.title,
          value: data.value !== undefined ? data.value : existing.value,
          currency: data.currency ?? existing.currency,
          stageId: data.stageId ?? existing.stageId,
          contactId: data.contactId !== undefined ? data.contactId : existing.contactId,
          companyId: data.companyId !== undefined ? data.companyId : existing.companyId,
          ownerId: data.ownerId !== undefined ? data.ownerId : existing.ownerId,
          customFields: (data.customFields as any) !== undefined ? (data.customFields as any) : ((existing.customFields as any) ?? {}),
          version: { increment: 1 }, // Auto increment version for concurrency control
        },
        include: { stage: true, contact: true },
      });
    },

    // =========================================================
    // LEADS & LEAD ENGINE
    // =========================================================
    async getLeads(filters?: { status?: any; ownerId?: string; limit?: number; offset?: number }) {
      const where: any = { workspaceId };
      if (filters?.status) where.status = filters.status;
      if (filters?.ownerId) where.ownerId = filters.ownerId;

      const limit = Math.min(filters?.limit || 50, 100);
      const offset = filters?.offset || 0;

      const [total, items] = await Promise.all([
        prisma.lead.count({ where }),
        prisma.lead.findMany({
          where,
          include: { contact: true, owner: true },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
      ]);
      return { total, items, limit, offset };
    },

    async getLeadById(leadId: string) {
      return prisma.lead.findFirst({
        where: { id: leadId, workspaceId },
        include: { contact: true, owner: true, activities: { orderBy: { createdAt: 'desc' } } },
      });
    },

    // Recovery Queue endpoint (F3.7):
    // Lists leads that are:
    // 1) unacknowledged beyond their window (status=ASSIGNED, ackDeadline < now)
    // 2) escalated more than once (escalationLevel >= 2)
    // 3) untouched for configured idle period
    async getRecoveryQueue(idleHours = 24) {
      const now = new Date();
      const idleThreshold = new Date(Date.now() - idleHours * 3600 * 1000);

      const items = await prisma.lead.findMany({
        where: {
          workspaceId,
          status: { in: ['ASSIGNED', 'ESCALATED', 'NEW'] },
          OR: [
            { ackDeadline: { lt: now }, acknowledgedAt: null },
            { escalationLevel: { gte: 2 } },
            { updatedAt: { lt: idleThreshold } },
          ],
        },
        include: { contact: true, owner: true },
        orderBy: { updatedAt: 'asc' },
      });

      return items.map((lead) => {
        let reason = 'Unacknowledged beyond window';
        if (lead.escalationLevel >= 2) {
          reason = `Multiple escalations (Level ${lead.escalationLevel})`;
        } else if (lead.updatedAt < idleThreshold) {
          reason = `Untouched for over ${idleHours} hours`;
        }

        return {
          ...lead,
          recoveryReason: reason,
        };
      });
    },

    // =========================================================
    // ACTIVITIES TIMELINE (F2.7)
    // =========================================================
    async getActivities(params: { contactId?: string; opportunityId?: string; leadId?: string }) {
      const where: any = { workspaceId };
      if (params.contactId) where.contactId = params.contactId;
      if (params.opportunityId) where.opportunityId = params.opportunityId;
      if (params.leadId) where.leadId = params.leadId;

      return prisma.activity.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    },

    async createActivity(data: any) {
      return prisma.activity.create({
        data: {
          workspaceId,
          contactId: data.contactId ?? null,
          opportunityId: data.opportunityId ?? null,
          leadId: data.leadId ?? null,
          actorId: data.actorId ?? 'system',
          type: data.type,
          description: data.description,
          metadata: data.metadata ?? undefined,
        },
      });
    },

    // =========================================================
    // SAVED LISTS (F2.6, Q9)
    // =========================================================
    async getSavedLists(userId: string) {
      return prisma.savedList.findMany({
        where: { workspaceId, userId },
        orderBy: { createdAt: 'desc' },
      });
    },

    async createSavedList(userId: string, data: { name: string; entityType: string; criteria: any }) {
      return prisma.savedList.create({
        data: {
          workspaceId,
          userId,
          name: data.name,
          entityType: data.entityType,
          criteria: data.criteria,
        },
      });
    },
  };
}
