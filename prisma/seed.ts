import { PrismaClient, UserRole, AvailabilityStatus, CustomFieldType, LeadStatus } from '@prisma/client';
import * as argon2 from '@node-rs/argon2';

const prisma = new PrismaClient();

export const ALL_PERMISSIONS = [
  'crm.view',
  'crm.create',
  'crm.edit',
  'crm.delete',
  'crm.export',
  'crm.opportunity_value',
  'assignment.manage',
  'integrations.manage',
  'audit.view',
];

async function main() {
  console.log('--- Starting Database Seeding ---');

  // 1. Create Workspace
  const workspaceId = 'ws_demo_acme_corp';
  const workspace = await prisma.workspace.upsert({
    where: { slug: 'acme' },
    update: {
      name: 'Acme Corporation',
      settings: {
        ackWindowSeconds: 300,
        escalationTimeoutSeconds: 300,
        maxOpenLeadsDefault: 10,
        enableAutoEscalation: true,
      },
    },
    create: {
      id: workspaceId,
      workspaceId: workspaceId,
      name: 'Acme Corporation',
      slug: 'acme',
      settings: {
        ackWindowSeconds: 300,
        escalationTimeoutSeconds: 300,
        maxOpenLeadsDefault: 10,
        enableAutoEscalation: true,
      },
    },
  });

  console.log(`✓ Workspace created: ${workspace.name} (${workspace.id})`);

  // 2. Hash default password
  const defaultPassword = 'Password123!';
  const passwordHash = await argon2.hash(defaultPassword);

  // 3. Create Users
  const usersToCreate = [
    {
      email: 'owner@acme.com',
      name: 'Alice Owner',
      role: UserRole.OWNER,
      availabilityStatus: AvailabilityStatus.AVAILABLE,
      maxOpenLeads: 20,
      telegramDestination: '@alice_owner',
      permissions: ALL_PERMISSIONS,
    },
    {
      email: 'admin@acme.com',
      name: 'Bob Admin',
      role: UserRole.ADMIN,
      availabilityStatus: AvailabilityStatus.AVAILABLE,
      maxOpenLeads: 15,
      telegramDestination: '@bob_admin',
      permissions: ALL_PERMISSIONS,
    },
    {
      email: 'charlie@acme.com',
      name: 'Charlie Sales',
      role: UserRole.USER,
      availabilityStatus: AvailabilityStatus.AVAILABLE,
      maxOpenLeads: 5,
      telegramDestination: '@charlie_sales',
      permissions: ['crm.view', 'crm.create', 'crm.edit', 'crm.export'],
    },
    {
      email: 'dana@acme.com',
      name: 'Dana Support',
      role: UserRole.USER,
      availabilityStatus: AvailabilityStatus.BUSY,
      maxOpenLeads: 5,
      telegramDestination: '@dana_support',
      permissions: ['crm.view', 'crm.create', 'crm.edit'],
    },
    {
      email: 'evan@acme.com',
      name: 'Evan Rep',
      role: UserRole.USER,
      availabilityStatus: AvailabilityStatus.OFFLINE,
      maxOpenLeads: 5,
      telegramDestination: '@evan_rep',
      permissions: ['crm.view'],
    },
  ];

  const createdUsers: Record<string, any> = {};

  for (const u of usersToCreate) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        role: u.role,
        availabilityStatus: u.availabilityStatus,
        maxOpenLeads: u.maxOpenLeads,
        telegramDestination: u.telegramDestination,
      },
      create: {
        workspaceId: workspace.id,
        email: u.email,
        passwordHash,
        name: u.name,
        role: u.role,
        availabilityStatus: u.availabilityStatus,
        maxOpenLeads: u.maxOpenLeads,
        telegramDestination: u.telegramDestination,
      },
    });

    createdUsers[u.email] = user;

    // Permissions as rows (Rule 2)
    for (const action of u.permissions) {
      await prisma.permission.upsert({
        where: {
          workspaceId_userId_action: {
            workspaceId: workspace.id,
            userId: user.id,
            action,
          },
        },
        update: {},
        create: {
          workspaceId: workspace.id,
          userId: user.id,
          action,
        },
      });
    }
  }

  console.log('✓ Users & Permissions seeded');

  // 4. Sample Pipeline and Stages
  let pipeline = await prisma.pipeline.findFirst({
    where: { workspaceId: workspace.id, isDefault: true },
  });

  if (!pipeline) {
    pipeline = await prisma.pipeline.create({
      data: {
        workspaceId: workspace.id,
        name: 'Standard Sales Pipeline',
        isDefault: true,
      },
    });
  }

  const stagesData = [
    { name: 'New Lead', order: 0, requiredFields: [] },
    { name: 'Contacted', order: 1, requiredFields: ['contact_phone'] },
    { name: 'Meeting Scheduled', order: 2, requiredFields: ['deal_budget'] },
    { name: 'Proposal Sent', order: 3, requiredFields: ['deal_budget', 'proposal_doc'] },
    { name: 'Closed Won', order: 4, isWon: true, isLost: false, requiredFields: [] },
    { name: 'Closed Lost', order: 5, isWon: false, isLost: true, requiredFields: ['lost_reason'] },
  ];

  const createdStages: any[] = [];
  for (const s of stagesData) {
    let stage = await prisma.stage.findFirst({
      where: { workspaceId: workspace.id, pipelineId: pipeline.id, name: s.name },
    });

    if (!stage) {
      stage = await prisma.stage.create({
        data: {
          workspaceId: workspace.id,
          pipelineId: pipeline.id,
          name: s.name,
          order: s.order,
          isWon: s.isWon ?? false,
          isLost: s.isLost ?? false,
          requiredFields: s.requiredFields,
        },
      });
    }
    createdStages.push(stage);
  }

  console.log('✓ Pipeline & Stages created');

  // 5. Custom Fields scoped to Pipeline
  const customFieldsData = [
    { name: 'Deal Budget', key: 'deal_budget', type: CustomFieldType.NUMBER, isRequired: false },
    { name: 'Proposal Document', key: 'proposal_doc', type: CustomFieldType.TEXT, isRequired: false },
    { name: 'Lost Reason', key: 'lost_reason', type: CustomFieldType.TEXT, isRequired: false },
    {
      name: 'Client Tier',
      key: 'client_tier',
      type: CustomFieldType.DROPDOWN,
      options: ['Tier 1 - Enterprise', 'Tier 2 - Mid Market', 'Tier 3 - SMB'],
      isRequired: false,
    },
  ];

  for (const cf of customFieldsData) {
    await prisma.customField.upsert({
      where: {
        workspaceId_key_pipelineId: {
          workspaceId: workspace.id,
          key: cf.key,
          pipelineId: pipeline.id,
        },
      },
      update: {
        name: cf.name,
        type: cf.type,
        options: (cf.options as any) ?? undefined,
      },
      create: {
        workspaceId: workspace.id,
        pipelineId: pipeline.id,
        name: cf.name,
        key: cf.key,
        type: cf.type,
        options: (cf.options as any) ?? undefined,
        isRequired: cf.isRequired,
      },
    });
  }

  console.log('✓ Custom Fields created');

  // 6. Companies & Contacts
  let company = await prisma.company.findFirst({
    where: { workspaceId: workspace.id, name: 'Globex Corp' },
  });

  if (!company) {
    company = await prisma.company.create({
      data: {
        workspaceId: workspace.id,
        name: 'Globex Corp',
        domain: 'globex.com',
        industry: 'Cloud Infrastructure',
        phone: '+14155552671',
      },
    });
  }

  let contact = await prisma.contact.findFirst({
    where: { workspaceId: workspace.id, phone: '+14155550199' },
  });

  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        workspaceId: workspace.id,
        companyId: company.id,
        firstName: 'John',
        lastName: 'Doe',
        email: 'johndoe@globex.com',
        phone: '+14155550199',
        optOut: false,
      },
    });
  }

  // 7. Opportunity
  let opp = await prisma.opportunity.findFirst({
    where: { workspaceId: workspace.id, title: 'Globex Multi-Cloud Rollout' },
  });

  if (!opp) {
    opp = await prisma.opportunity.create({
      data: {
        workspaceId: workspace.id,
        title: 'Globex Multi-Cloud Rollout',
        value: 45000.0,
        currency: 'USD',
        stageId: createdStages[1].id, // Contacted
        contactId: contact.id,
        companyId: company.id,
        ownerId: createdUsers['charlie@acme.com'].id,
        customFields: {
          deal_budget: 50000,
          client_tier: 'Tier 1 - Enterprise',
        },
        version: 1,
      },
    });
  }

  // 8. Lead
  let lead = await prisma.lead.findFirst({
    where: { workspaceId: workspace.id, title: 'Inbound Web Lead - Globex' },
  });

  if (!lead) {
    lead = await prisma.lead.create({
      data: {
        workspaceId: workspace.id,
        title: 'Inbound Web Lead - Globex',
        contactId: contact.id,
        source: 'web_form',
        status: LeadStatus.ASSIGNED,
        ownerId: createdUsers['charlie@acme.com'].id,
        assignedAt: new Date(),
        ackDeadline: new Date(Date.now() + 300 * 1000), // 5 min ack window
        escalationLevel: 0,
        version: 1,
      },
    });
  }

  // 9. Initial Integrations placeholders
  const providers = ['TWILIO', 'SAFEPAY', 'GOOGLE_CALENDAR', 'TELEGRAM'] as const;
  for (const prov of providers) {
    await prisma.integration.upsert({
      where: {
        workspaceId_provider: {
          workspaceId: workspace.id,
          provider: prov,
        },
      },
      update: {},
      create: {
        workspaceId: workspace.id,
        provider: prov,
        status: 'DISCONNECTED',
      },
    });
  }

  // 10. Audit Log Initial Entry (Append-only)
  await prisma.auditLog.create({
    data: {
      workspaceId: workspace.id,
      actorId: createdUsers['owner@acme.com'].id,
      eventType: 'WORKSPACE_INITIALIZED',
      targetType: 'workspace',
      targetId: workspace.id,
      afterValue: {
        name: workspace.name,
        slug: workspace.slug,
        usersCount: usersToCreate.length,
      },
    },
  });

  console.log('✓ Audit log initial record created');
  console.log('--- Seed Completed Successfully ---');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
