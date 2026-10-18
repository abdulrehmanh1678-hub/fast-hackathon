export type UserRole = 'OWNER' | 'ADMIN' | 'USER';

export type AvailabilityStatus = 'AVAILABLE' | 'BUSY' | 'ON_LEAVE' | 'OFFLINE';

export type CustomFieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'DROPDOWN' | 'CHECKBOX';

export type LeadStatus = 'NEW' | 'ASSIGNED' | 'ACKNOWLEDGED' | 'ESCALATED' | 'RESOLVED';

export type ActivityType =
  | 'NOTE'
  | 'CALL'
  | 'EMAIL'
  | 'STAGE_CHANGE'
  | 'ASSIGNMENT'
  | 'ACKNOWLEDGEMENT'
  | 'ESCALATION'
  | 'REASSIGNMENT'
  | 'FIELD_EDIT'
  | 'MESSAGE'
  | 'PAYMENT'
  | 'APPOINTMENT';

export type MessageDirection = 'INBOUND' | 'OUTBOUND';

export type MessageStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED';

export type PaymentStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED' | 'REFUNDED';

export type AppointmentStatus = 'SCHEDULED' | 'RESCHEDULED' | 'CANCELLED';

export type IntegrationProvider = 'TWILIO' | 'WHATSAPP_CLOUD' | 'SAFEPAY' | 'GOOGLE_CALENDAR' | 'TELEGRAM';

export type IntegrationStatus = 'DISCONNECTED' | 'CONNECTED' | 'ERROR';

export type IntegrationEventResult = 'SUCCESS' | 'FAILED' | 'REJECTED';

export const PERMISSIONS = {
  CRM_VIEW: 'crm.view',
  CRM_CREATE: 'crm.create',
  CRM_EDIT: 'crm.edit',
  CRM_DELETE: 'crm.delete',
  CRM_EXPORT: 'crm.export',
  CRM_OPPORTUNITY_VALUE: 'crm.opportunity_value',
  ASSIGNMENT_MANAGE: 'assignment.manage',
  INTEGRATIONS_MANAGE: 'integrations.manage',
  AUDIT_VIEW: 'audit.view',
} as const;

export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

export type PermissionKey = typeof PERMISSIONS[keyof typeof PERMISSIONS];

export interface SessionContext {
  userId: string;
  workspaceId: string;
  email: string;
  name: string;
  role: UserRole;
  permissions: string[];
}

