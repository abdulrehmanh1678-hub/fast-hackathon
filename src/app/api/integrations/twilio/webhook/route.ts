import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db';
import {
  getTwilioConfig,
  validateTwilioWebhookSignature,
  handleInboundTwilioMessage,
} from '@/server/integrations/twilio';
import { logIntegrationEvent } from '@/server/integrations/events-logger';
import { createErrorResponse } from '@/shared/errors';

export async function POST(req: NextRequest) {
  let workspaceId = 'default';
  try {
    // 1. Read RAW body as text before any parsing (Rule 6, Trap tip)
    const rawBody = await req.text();

    // Parse URL-encoded form data sent by Twilio
    const searchParams = new URLSearchParams(rawBody);
    const params: Record<string, string> = {};
    searchParams.forEach((val, key) => {
      params[key] = val;
    });

    // Determine target workspace from query param or fallback to first workspace
    const targetSlug = req.nextUrl.searchParams.get('workspace');
    let workspace = null;
    if (targetSlug) {
      workspace = await prisma.workspace.findUnique({ where: { slug: targetSlug } });
    }
    if (!workspace) {
      workspace = await prisma.workspace.findFirst();
    }
    if (!workspace) {
      return createErrorResponse('NO_WORKSPACE', 'No workspace configured', 400);
    }
    workspaceId = workspace.id;

    // 2. Signature verification on raw request (Rule 6, I1.2)
    const twilioSignature = req.headers.get('x-twilio-signature');
    const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
    const requestUrl = `${baseUrl}${req.nextUrl.pathname}${req.nextUrl.search}`;

    const twilioConfig = await getTwilioConfig(workspace.id);
    const isValidSignature = validateTwilioWebhookSignature({
      url: requestUrl,
      params,
      twilioSignature,
      authToken: twilioConfig.authToken,
    });

    if (!isValidSignature) {
      // Reject and record forged request (I1.2)
      await logIntegrationEvent({
        workspaceId: workspace.id,
        provider: 'TWILIO',
        eventType: 'WEBHOOK_SIGNATURE_FAILED',
        result: 'REJECTED',
        errorMessage: 'Invalid Twilio X-Twilio-Signature header on raw body',
        requestPayload: { headers: { signature: twilioSignature }, url: requestUrl },
      });

      return createErrorResponse('INVALID_SIGNATURE', 'Twilio webhook signature verification failed', 401);
    }

    const messageSid = params.MessageSid;
    const from = params.From;
    const body = params.Body || '';

    if (!messageSid || !from) {
      return createErrorResponse('INVALID_PAYLOAD', 'Missing MessageSid or From', 400);
    }

    // 3. Process inbound message (Idempotent by unique providerMessageId, I1.8, I1.5)
    const result = await handleInboundTwilioMessage({
      workspaceId: workspace.id,
      messageSid,
      from,
      body,
      rawPayload: params,
    });

    // Return TwiML empty response
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      }
    );
  } catch (err: any) {
    console.error('Twilio webhook handler error:', err);
    await logIntegrationEvent({
      workspaceId,
      provider: 'TWILIO',
      eventType: 'WEBHOOK_ERROR',
      result: 'FAILED',
      errorMessage: err.message,
    });
    return createErrorResponse('WEBHOOK_ERROR', err.message, 500);
  }
}
