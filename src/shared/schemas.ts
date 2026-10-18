import { z } from 'zod';

// =============================================================
// AUTH SCHEMAS
// =============================================================

export const SignupSchema = z.object({
  companyName: z.string().min(2, 'Company name must be at least 2 characters').max(100),
  workspaceSlug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug must only contain lowercase alphanumeric characters and dashes'),
  email: z.string().email('Invalid email address').max(150),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100)
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[0-9]/, 'Password must contain a number'),
});

export type SignupInput = z.infer<typeof SignupSchema>;

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof LoginSchema>;

// =============================================================
// USER & PERMISSION SCHEMAS
// =============================================================

export const UserInviteSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(2).max(100),
  password: z.string().min(8).max(100),
  role: z.enum(['ADMIN', 'USER']),
  availabilityStatus: z.enum(['AVAILABLE', 'BUSY', 'ON_LEAVE', 'OFFLINE']).optional().default('AVAILABLE'),
  maxOpenLeads: z.number().int().positive().optional().default(10),
  telegramDestination: z.string().max(100).optional(),
  permissions: z.array(z.string()).optional(),
});

export type UserInviteInput = z.infer<typeof UserInviteSchema>;

export const UserUpdateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  availabilityStatus: z.enum(['AVAILABLE', 'BUSY', 'ON_LEAVE', 'OFFLINE']).optional(),
  maxOpenLeads: z.number().int().positive().optional(),
  telegramDestination: z.string().max(100).nullable().optional(),
  role: z.enum(['ADMIN', 'USER']).optional(),
});

export type UserUpdateInput = z.infer<typeof UserUpdateSchema>;

export const PermissionUpdateSchema = z.object({
  permissions: z.array(z.string()),
});

export type PermissionUpdateInput = z.infer<typeof PermissionUpdateSchema>;

// =============================================================
// CONTACTS & COMPANIES SCHEMAS
// =============================================================

export const CompanyCreateSchema = z.object({
  name: z.string().min(1, 'Company name is required').max(150),
  domain: z.string().max(150).optional(),
  industry: z.string().max(100).optional(),
  phone: z.string().max(50).optional(),
});

export type CompanyCreateInput = z.infer<typeof CompanyCreateSchema>;

export const ContactCreateSchema = z.object({
  companyId: z.string().cuid().nullable().optional(),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  optOut: z.boolean().optional().default(false),
});

export type ContactCreateInput = z.infer<typeof ContactCreateSchema>;

export const ContactUpdateSchema = ContactCreateSchema.partial();
export type ContactUpdateInput = z.infer<typeof ContactUpdateSchema>;

// =============================================================
// PIPELINES, STAGES & CUSTOM FIELDS
// =============================================================

export const PipelineCreateSchema = z.object({
  name: z.string().min(1).max(100),
  isDefault: z.boolean().optional().default(false),
});

export const StageCreateSchema = z.object({
  name: z.string().min(1).max(100),
  order: z.number().int().nonnegative(),
  isWon: z.boolean().optional().default(false),
  isLost: z.boolean().optional().default(false),
  requiredFields: z.array(z.string()).optional().default([]),
});

export const StageUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  order: z.number().int().nonnegative().optional(),
  isWon: z.boolean().optional(),
  isLost: z.boolean().optional(),
  requiredFields: z.array(z.string()).optional(),
});

export const CustomFieldCreateSchema = z.object({
  pipelineId: z.string().cuid().nullable().optional(),
  name: z.string().min(1).max(100),
  key: z.string().min(1).max(50).regex(/^[a-z0-9_]+$/, 'Key must be lowercase snake_case'),
  type: z.enum(['TEXT', 'NUMBER', 'DATE', 'DROPDOWN', 'CHECKBOX']),
  options: z.array(z.string()).nullable().optional(),
  isRequired: z.boolean().optional().default(false),
});

// =============================================================
// OPPORTUNITIES SCHEMAS
// =============================================================

export const OpportunityCreateSchema = z.object({
  title: z.string().min(1).max(200),
  value: z.number().nonnegative().default(0.0),
  currency: z.string().length(3).default('USD'),
  stageId: z.string(),
  contactId: z.string().nullable().optional(),
  companyId: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
  customFields: z.record(z.string(), z.any()).optional().default({}),
});

export type OpportunityCreateInput = z.infer<typeof OpportunityCreateSchema>;

export const OpportunityUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  value: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  stageId: z.string().optional(),
  contactId: z.string().nullable().optional(),
  companyId: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
  customFields: z.record(z.string(), z.any()).optional(),
  version: z.number().int().positive('Version is required for optimistic concurrency'), // Q4
});

export type OpportunityUpdateInput = z.infer<typeof OpportunityUpdateSchema>;

// =============================================================
// LEADS SCHEMAS
// =============================================================

export const LeadCreatePublicSchema = z.object({
  title: z.string().min(1).max(200),
  source: z.string().default('web_form'),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  customFields: z.record(z.string(), z.any()).optional(),
});

export type LeadCreatePublicInput = z.infer<typeof LeadCreatePublicSchema>;

export const LeadCreateManualSchema = z.object({
  title: z.string().min(1).max(200),
  contactId: z.string().nullable().optional(),
  source: z.string().default('manual'),
  ownerId: z.string().nullable().optional(),
  customFields: z.record(z.string(), z.any()).optional(),
});

export type LeadCreateManualInput = z.infer<typeof LeadCreateManualSchema>;

export const LeadAcknowledgeSchema = z.object({
  note: z.string().max(500).optional(),
});

// =============================================================
// ACTIVITIES & AUDIT SCHEMAS
// =============================================================

export const ActivityCreateSchema = z.object({
  contactId: z.string().nullable().optional(),
  opportunityId: z.string().nullable().optional(),
  leadId: z.string().nullable().optional(),
  type: z.enum([
    'NOTE',
    'CALL',
    'EMAIL',
    'STAGE_CHANGE',
    'ASSIGNMENT',
    'ACKNOWLEDGEMENT',
    'ESCALATION',
    'REASSIGNMENT',
    'FIELD_EDIT',
    'MESSAGE',
    'PAYMENT',
    'APPOINTMENT',
  ]),
  description: z.string().min(1).max(2000),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type ActivityCreateInput = z.infer<typeof ActivityCreateSchema>;

// =============================================================
// SAVED LISTS SCHEMAS
// =============================================================

export const SavedListCreateSchema = z.object({
  name: z.string().min(1).max(100),
  entityType: z.enum(['contact', 'opportunity', 'lead']),
  criteria: z.object({
    stageId: z.string().optional(),
    ownerId: z.string().optional(),
    status: z.string().optional(),
    tags: z.array(z.string()).optional(),
    createdAfter: z.string().optional(),
    createdBefore: z.string().optional(),
    minAmount: z.number().optional(),
    maxAmount: z.number().optional(),
    query: z.string().optional(),
  }).refine((data) => Object.keys(data).length >= 1, {
    message: 'At least one filter criterion is required',
  }),
});

// =============================================================
// MESSAGING & TWILIO SCHEMAS
// =============================================================

export const MessageSendSchema = z.object({
  conversationId: z.string().optional(),
  contactId: z.string(),
  body: z.string().min(1, 'Message body cannot be empty').max(1600),
});

export type MessageSendInput = z.infer<typeof MessageSendSchema>;

// =============================================================
// PAYMENTS & SAFEPAY SCHEMAS
// =============================================================

export const PaymentCheckoutCreateSchema = z.object({
  opportunityId: z.string(),
  amount: z.number().positive('Payment amount must be greater than 0'),
  currency: z.string().length(3).default('usd'),
  description: z.string().max(250).optional(),
});

export type PaymentCheckoutCreateInput = z.infer<typeof PaymentCheckoutCreateSchema>;

// =============================================================
// APPOINTMENTS & CALENDAR SCHEMAS
// =============================================================

export const AppointmentCreateSchema = z.object({
  contactId: z.string().nullable().optional(),
  opportunityId: z.string().nullable().optional(),
  hostUserId: z.string(),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  startTime: z.string().datetime('startTime must be valid ISO 8601 UTC string'), // Stored UTC (I3.5)
  endTime: z.string().datetime('endTime must be valid ISO 8601 UTC string'),     // Stored UTC (I3.5)
  timeZone: z.string().min(1, 'IANA timeZone is required (e.g. America/New_York)'),
});

export type AppointmentCreateInput = z.infer<typeof AppointmentCreateSchema>;

export const AppointmentUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  timeZone: z.string().optional(),
  status: z.enum(['SCHEDULED', 'RESCHEDULED', 'CANCELLED']).optional(),
});

export type AppointmentUpdateInput = z.infer<typeof AppointmentUpdateSchema>;

// =============================================================
// INTEGRATIONS CONFIG SCHEMAS
// =============================================================

export const IntegrationSaveConfigSchema = z.object({
  provider: z.enum(['TWILIO', 'WHATSAPP_CLOUD', 'SAFEPAY', 'GOOGLE_CALENDAR', 'TELEGRAM']),
  credentials: z.record(z.string(), z.string()),
  config: z.record(z.string(), z.any()).optional(),
});

