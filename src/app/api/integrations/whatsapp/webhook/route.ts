import { NextRequest, NextResponse } from 'next/server';
import { createErrorResponse } from '@/shared/errors';
import { getWhatsAppWebhookConfigs, handleWhatsAppCloudWebhook, verifyWhatsAppWebhookSignature } from '@/server/integrations/whatsapp-cloud';

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');
  if (mode !== 'subscribe' || !token || !challenge) return createErrorResponse('INVALID_VERIFICATION', 'Invalid WhatsApp webhook verification request.', 400);
  try {
    const configs = await getWhatsAppWebhookConfigs();
    if (!configs.some((config) => config.verifyToken && config.verifyToken === token)) {
      return createErrorResponse('INVALID_VERIFY_TOKEN', 'WhatsApp webhook verify token did not match.', 403);
    }
    return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  } catch (error) {
    console.error('WhatsApp webhook verification failed:', error);
    return createErrorResponse('WHATSAPP_WEBHOOK_ERROR', 'WhatsApp webhook verification could not be completed.', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-hub-signature-256') || '';
    const configs = await getWhatsAppWebhookConfigs();
    if (!configs.length) return createErrorResponse('WHATSAPP_WEBHOOK_NOT_CONFIGURED', 'No WhatsApp Cloud API workspace is configured.', 503);
    if (!configs.some((config) => verifyWhatsAppWebhookSignature(rawBody, signature, config.appSecret))) {
      return createErrorResponse('INVALID_SIGNATURE', 'WhatsApp webhook signature verification failed.', 401);
    }
    let payload: any;
    try { payload = JSON.parse(rawBody); } catch { return createErrorResponse('INVALID_PAYLOAD', 'WhatsApp webhook body must be valid JSON.', 400); }
    for (const config of configs) await handleWhatsAppCloudWebhook(config, payload);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('WhatsApp webhook handler failed:', error);
    return createErrorResponse('WHATSAPP_WEBHOOK_ERROR', error instanceof Error ? error.message : 'WhatsApp webhook failed.', 500);
  }
}
