import crypto from 'crypto';
import { prisma } from '@/server/db';
import { decryptSecret } from '@/server/crypto/encryption';
import { AppError } from '@/shared/errors';
import { logIntegrationEvent } from '@/server/integrations/events-logger';
import { createAndAssignLead } from '@/server/lead-engine/assignment';

export type WhatsAppCloudConfig = {
  workspaceId: string;
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
  appSecret: string;
  verifyToken: string;
  graphApiVersion: string;
};

type StoredCredentials = Pick<WhatsAppCloudConfig, 'accessToken' | 'appSecret' | 'verifyToken'>;
const graphVersion = () => process.env.WHATSAPP_GRAPH_API_VERSION || 'v25.0';

function envConfig(workspaceId: string): WhatsAppCloudConfig {
  return {
    workspaceId,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    appSecret: process.env.WHATSAPP_APP_SECRET || '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    graphApiVersion: graphVersion(),
  };
}

function integrationConfig(item: { workspaceId: string; credentialsEncrypted: string | null; config: unknown }): WhatsAppCloudConfig | null {
  if (!item.credentialsEncrypted) return null;
  try {
    const credentials = JSON.parse(decryptSecret(item.credentialsEncrypted)) as Partial<StoredCredentials>;
    const publicConfig = item.config && typeof item.config === 'object' ? item.config as Record<string, unknown> : {};
    const result = {
      workspaceId: item.workspaceId,
      phoneNumberId: String(publicConfig.phoneNumberId || ''),
      businessAccountId: String(publicConfig.businessAccountId || ''),
      accessToken: credentials.accessToken || '',
      appSecret: credentials.appSecret || '',
      verifyToken: credentials.verifyToken || '',
      graphApiVersion: String(publicConfig.graphApiVersion || graphVersion()),
    };
    return result.phoneNumberId && result.accessToken ? result : null;
  } catch {
    return null;
  }
}

function requireSendConfig(config: WhatsAppCloudConfig) {
  if (!config.phoneNumberId || !config.accessToken) {
    throw new AppError('WHATSAPP_NOT_CONFIGURED', 'WhatsApp Cloud API is not configured for this workspace.', 503);
  }
}

export async function getWhatsAppCloudConfig(workspaceId: string): Promise<WhatsAppCloudConfig> {
  const integration = await prisma.integration.findUnique({
    where: { workspaceId_provider: { workspaceId, provider: 'WHATSAPP_CLOUD' } },
  });
  const saved = integrationConfig(integration || { workspaceId, credentialsEncrypted: null, config: null });
  if (saved) return saved;

  const slug = process.env.WHATSAPP_WORKSPACE_SLUG;
  const workspace = slug
    ? await prisma.workspace.findUnique({ where: { slug }, select: { id: true } })
    : null;
  if (workspace && workspace.id === workspaceId) return envConfig(workspaceId);
  throw new AppError('WHATSAPP_NOT_CONFIGURED', 'WhatsApp Cloud API is not configured for this workspace.', 503);
}

export async function getWhatsAppWebhookConfigs(): Promise<WhatsAppCloudConfig[]> {
  const integrations = await prisma.integration.findMany({ where: { provider: 'WHATSAPP_CLOUD', status: 'CONNECTED' } });
  const saved = integrations.map(integrationConfig).filter((item): item is WhatsAppCloudConfig => Boolean(item));
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const workspaceSlug = process.env.WHATSAPP_WORKSPACE_SLUG;
  if (phoneNumberId && workspaceSlug) {
    const workspace = await prisma.workspace.findUnique({ where: { slug: workspaceSlug }, select: { id: true } });
    if (workspace && !saved.some((item) => item.phoneNumberId === phoneNumberId)) saved.push(envConfig(workspace.id));
  }
  return saved;
}

export function verifyWhatsAppWebhookSignature(rawBody: string, signature: string, appSecret: string) {
  if (!signature.startsWith('sha256=') || !appSecret) return false;
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest();
  let provided: Buffer;
  try { provided = Buffer.from(signature.slice(7), 'hex'); } catch { return false; }
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

export async function sendWhatsAppCloudMessage(params: {
  workspaceId: string; contactId: string; body: string; senderUserId: string;
}) {
  const { workspaceId, contactId, body, senderUserId } = params;
  const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId } });
  if (!contact) throw new AppError('NOT_FOUND', 'Contact not found', 404);
  if (!contact.phone) throw new AppError('NO_PHONE', 'Contact has no phone number', 400);
  if (contact.optOut) throw new AppError('CONTACT_OPTED_OUT', 'This contact opted out of messaging.', 400);

  const config = await getWhatsAppCloudConfig(workspaceId);
  requireSendConfig(config);
  let conversation = await prisma.conversation.findFirst({ where: { workspaceId, contactId } });
  if (!conversation) conversation = await prisma.conversation.create({
    data: { workspaceId, contactId, assignedUserId: senderUserId, channel: 'whatsapp' },
  });

  const message = await prisma.message.create({
    data: { workspaceId, conversationId: conversation.id, direction: 'OUTBOUND', body, status: 'QUEUED' },
  });

  try {
    const response = await fetch(`https://graph.facebook.com/${config.graphApiVersion}/${config.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: contact.phone.replace(/\D/g, ''), type: 'text', text: { body, preview_url: false } }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error?.message || `Meta WhatsApp API returned ${response.status}`);
    const providerMessageId = result?.messages?.[0]?.id;
    if (!providerMessageId) throw new Error('Meta did not return a WhatsApp message ID.');
    const updated = await prisma.message.update({ where: { id: message.id }, data: { providerMessageId, status: 'SENT' } });
    await logIntegrationEvent({ workspaceId, provider: 'WHATSAPP_CLOUD', eventType: 'OUTBOUND_MESSAGE_SENT', providerEventId: providerMessageId, result: 'SUCCESS', reference: updated.id, requestPayload: { contactId, messageId: updated.id }, responsePayload: { providerMessageId } });
    return updated;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Could not send WhatsApp message.';
    const updated = await prisma.message.update({ where: { id: message.id }, data: { status: 'FAILED', failureReason: reason } });
    await logIntegrationEvent({ workspaceId, provider: 'WHATSAPP_CLOUD', eventType: 'OUTBOUND_MESSAGE_FAILED', result: 'FAILED', reference: updated.id, requestPayload: { contactId, messageId: updated.id }, errorMessage: reason });
    throw new AppError('WHATSAPP_SEND_FAILED', reason, 502);
  }
}

function messageBody(message: any): string {
  if (message.type === 'text') return message.text?.body || '';
  if (message.type === 'button') return message.button?.text || '[button reply]';
  if (message.type === 'interactive') return message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '[interactive reply]';
  return message[message.type]?.caption || `[${message.type || 'unknown'} message]`;
}

async function receiveMessage(config: WhatsAppCloudConfig, message: any, rawPayload: unknown) {
  const providerMessageId = String(message?.id || '');
  const waId = String(message?.from || '').replace(/\D/g, '');
  if (!providerMessageId || !waId) return;
  const prior = await prisma.message.findUnique({ where: { providerMessageId } });
  if (prior) return;

  const phone = `+${waId}`;
  let contact = await prisma.contact.findFirst({ where: { workspaceId: config.workspaceId, phone: { in: [waId, phone] } } });
  let lead = null;
  if (!contact) {
    contact = await prisma.contact.create({ data: { workspaceId: config.workspaceId, firstName: 'WhatsApp', lastName: waId, phone } });
    lead = await createAndAssignLead({ workspaceId: config.workspaceId, title: `WhatsApp inquiry from ${phone}`, source: 'messaging', contactId: contact.id, customFields: { initialMessage: messageBody(message), channel: 'whatsapp' } });
  }
  let conversation = await prisma.conversation.findFirst({ where: { workspaceId: config.workspaceId, contactId: contact.id } });
  if (!conversation) conversation = await prisma.conversation.create({ data: { workspaceId: config.workspaceId, contactId: contact.id, assignedUserId: lead?.ownerId ?? null, channel: 'whatsapp' } });
  const stored = await prisma.message.create({ data: { workspaceId: config.workspaceId, conversationId: conversation.id, direction: 'INBOUND', body: messageBody(message), providerMessageId, status: 'DELIVERED' } });
  await logIntegrationEvent({ workspaceId: config.workspaceId, provider: 'WHATSAPP_CLOUD', eventType: 'INBOUND_MESSAGE_RECEIVED', providerEventId: providerMessageId, result: 'SUCCESS', reference: stored.id, requestPayload: rawPayload, responsePayload: { contactId: contact.id, conversationId: conversation.id } });
}

async function receiveStatus(config: WhatsAppCloudConfig, status: any, rawPayload: unknown) {
  const messageId = String(status?.id || '');
  const value = String(status?.status || '').toLowerCase();
  const mapped = value === 'read' || value === 'delivered' ? 'DELIVERED' : value === 'sent' ? 'SENT' : value === 'failed' ? 'FAILED' : null;
  if (!messageId || !mapped) return;
  const message = await prisma.message.findFirst({ where: { workspaceId: config.workspaceId, providerMessageId: messageId } });
  if (!message) return;
  const statusEventId = `${messageId}:${value}`;
  if (await prisma.integrationEvent.findUnique({ where: { providerEventId: statusEventId } })) return;
  const failure = status.errors?.[0]?.message || status.errors?.[0]?.title || null;
  await prisma.message.update({ where: { id: message.id }, data: { status: mapped, failureReason: mapped === 'FAILED' ? failure : null } });
  await logIntegrationEvent({ workspaceId: config.workspaceId, provider: 'WHATSAPP_CLOUD', eventType: `MESSAGE_STATUS_${value.toUpperCase()}`, providerEventId: statusEventId, result: mapped === 'FAILED' ? 'FAILED' : 'SUCCESS', reference: message.id, requestPayload: rawPayload, responsePayload: { status: mapped }, errorMessage: failure });
}

export async function handleWhatsAppCloudWebhook(config: WhatsAppCloudConfig, payload: any) {
  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      if (String(change?.value?.metadata?.phone_number_id || '') !== config.phoneNumberId) continue;
      for (const message of change.value.messages || []) await receiveMessage(config, message, payload);
      for (const status of change.value.statuses || []) await receiveStatus(config, status, payload);
    }
  }
}
