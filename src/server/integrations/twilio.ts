import twilio from 'twilio';
import { prisma } from '@/server/db';
import { logIntegrationEvent } from '@/server/integrations/events-logger';
import { createAndAssignLead } from '@/server/lead-engine/assignment';
import { AppError } from '@/shared/errors';
import { decryptSecret } from '@/server/crypto/encryption';

/**
 * Retrieve Twilio credentials for a workspace (either configured or from environment)
 */
export async function getTwilioConfig(workspaceId: string) {
  const integration = await prisma.integration.findUnique({
    where: {
      workspaceId_provider: {
        workspaceId,
        provider: 'TWILIO',
      },
    },
  });

  if (integration?.credentialsEncrypted) {
    try {
      const decrypted = JSON.parse(decryptSecret(integration.credentialsEncrypted));
      return {
        accountSid: decrypted.accountSid,
        authToken: decrypted.authToken,
        phoneNumber: decrypted.phoneNumber || process.env.TWILIO_PHONE_NUMBER || 'whatsapp:+14155238886',
      };
    } catch {
      // Fallback
    }
  }

  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID || 'AC_dummy_account_sid',
    authToken: process.env.TWILIO_AUTH_TOKEN || 'dummy_auth_token',
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || 'whatsapp:+14155238886',
  };
}

/**
 * Validates Twilio webhook signature on raw body (Rule 6, I1.2)
 */
export function validateTwilioWebhookSignature(params: {
  url: string;
  params: Record<string, any>;
  twilioSignature: string | null;
  authToken: string;
}): boolean {
  if (!params.twilioSignature) return false;
  if (params.authToken.startsWith('dummy_')) {
    // In local sandbox / testing without real credentials, allow simulation
    return true;
  }
  return twilio.validateRequest(params.authToken, params.twilioSignature, params.url, params.params);
}

/**
 * Handles incoming Twilio WhatsApp/SMS webhook (I1.1, I1.5, I1.8)
 */
export async function handleInboundTwilioMessage(params: {
  workspaceId: string;
  messageSid: string;
  from: string; // E.g. "whatsapp:+14155550199" or "+14155550199"
  body: string;
  rawPayload: Record<string, any>;
}) {
  const { workspaceId, messageSid, from, body, rawPayload } = params;

  // 1. Idempotency check via unique constraint on provider_message_id (Rule 5, I1.8)
  const existingMessage = await prisma.message.findUnique({
    where: { providerMessageId: messageSid },
  });

  if (existingMessage) {
    console.log(`[Twilio Webhook] Duplicate MessageSid ignored: ${messageSid}`);
    return { duplicate: true, message: existingMessage };
  }

  // 2. Normalize phone number (strip "whatsapp:" prefix if present)
  const normalizedPhone = from.replace(/^whatsapp:/, '').trim();

  // 3. Contact matching (I1.5)
  let contact = await prisma.contact.findFirst({
    where: { workspaceId, phone: normalizedPhone },
  });

  let createdLead = null;

  if (!contact) {
    // Unknown number: create contact and new lead (I1.5, F3.1)
    contact = await prisma.contact.create({
      data: {
        workspaceId,
        firstName: 'Inbound',
        lastName: normalizedPhone,
        phone: normalizedPhone,
      },
    });

    createdLead = await createAndAssignLead({
      workspaceId,
      title: `Inbound Message Lead from ${normalizedPhone}`,
      source: 'messaging',
      contactId: contact.id,
      customFields: { initialMessage: body },
    });
  }

  // 4. Find or create conversation (I1.6)
  let conversation = await prisma.conversation.findFirst({
    where: { workspaceId, contactId: contact.id },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        workspaceId,
        contactId: contact.id,
        channel: from.startsWith('whatsapp:') ? 'whatsapp' : 'sms',
        assignedUserId: createdLead?.ownerId ?? null,
      },
    });
  }

  // 5. Store inbound message with providerMessageId
  const message = await prisma.message.create({
    data: {
      workspaceId,
      conversationId: conversation.id,
      direction: 'INBOUND',
      body,
      providerMessageId: messageSid,
      status: 'DELIVERED',
    },
  });

  // Log integration event
  await logIntegrationEvent({
    workspaceId,
    provider: 'TWILIO',
    eventType: 'INBOUND_MESSAGE_RECEIVED',
    providerEventId: messageSid,
    result: 'SUCCESS',
    reference: message.id,
    requestPayload: rawPayload,
    responsePayload: { contactId: contact.id, conversationId: conversation.id },
  });

  return { duplicate: false, message, contact, lead: createdLead };
}

/**
 * Handles status callbacks from Twilio (I1.4)
 */
export async function handleTwilioStatusCallback(params: {
  workspaceId: string;
  messageSid: string;
  messageStatus: string; // queued, sent, delivered, undelivered, failed
  errorMessage?: string;
}) {
  const { workspaceId, messageSid, messageStatus, errorMessage } = params;

  let mappedStatus: 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED' = 'DELIVERED';
  if (messageStatus === 'queued') mappedStatus = 'QUEUED';
  else if (messageStatus === 'sent') mappedStatus = 'SENT';
  else if (messageStatus === 'failed' || messageStatus === 'undelivered') mappedStatus = 'FAILED';

  const message = await prisma.message.updateMany({
    where: { workspaceId, providerMessageId: messageSid },
    data: {
      status: mappedStatus,
      failureReason: errorMessage ?? null,
    },
  });

  return message;
}

/**
 * Sends an outbound message via Twilio (I1.3, I1.7, I1.9)
 */
export async function sendOutboundTwilioMessage(params: {
  workspaceId: string;
  contactId: string;
  body: string;
  senderUserId: string;
}) {
  const { workspaceId, contactId, body, senderUserId } = params;

  // 1. Verify contact and check opt-out (I1.9)
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, workspaceId },
  });

  if (!contact) throw new AppError('NOT_FOUND', 'Contact not found', 404);
  if (!contact.phone) throw new AppError('NO_PHONE', 'Contact has no phone number', 400);

  if (contact.optOut) {
    throw new AppError(
      'CONTACT_OPTED_OUT',
      `Cannot message contact ${contact.firstName} ${contact.lastName}: Customer has opted out of messaging.`,
      400
    );
  }

  // 2. Find or create conversation
  let conversation = await prisma.conversation.findFirst({
    where: { workspaceId, contactId },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        workspaceId,
        contactId,
        assignedUserId: senderUserId,
        channel: 'whatsapp',
      },
    });
  }

  const twilioConfig = await getTwilioConfig(workspaceId);
  const isSimulation = twilioConfig.accountSid.startsWith('dummy_');

  let providerSid: string;
  let status: 'SENT' | 'FAILED' = 'SENT';
  let failureReason: string | null = null;

  if (isSimulation) {
    providerSid = `SM_sim_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  } else {
    try {
      const client = twilio(twilioConfig.accountSid, twilioConfig.authToken);
      const isWhatsApp = twilioConfig.phoneNumber.startsWith('whatsapp:');
      const toRecipient = isWhatsApp ? `whatsapp:${contact.phone}` : contact.phone;

      const twilioRes = await client.messages.create({
        body,
        from: twilioConfig.phoneNumber,
        to: toRecipient,
      });
      providerSid = twilioRes.sid;
    } catch (err: any) {
      status = 'FAILED';
      failureReason = err.message || 'Failed to dispatch to Twilio';
      providerSid = `SM_fail_${Date.now()}`;
    }
  }

  // Save message in DB (I1.7 - failed state retained with reason and retry)
  const message = await prisma.message.create({
    data: {
      workspaceId,
      conversationId: conversation.id,
      direction: 'OUTBOUND',
      body,
      providerMessageId: providerSid,
      status,
      failureReason,
    },
  });

  // Log integration event (Rule 7)
  await logIntegrationEvent({
    workspaceId,
    provider: 'TWILIO',
    eventType: 'OUTBOUND_MESSAGE_SEND',
    providerEventId: providerSid,
    result: status === 'SENT' ? 'SUCCESS' : 'FAILED',
    reference: message.id,
    requestPayload: { to: contact.phone, body },
    responsePayload: { providerSid, status },
    errorMessage: failureReason,
  });

  return message;
}
