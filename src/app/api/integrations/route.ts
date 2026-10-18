import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/server/auth/rbac';
import { prisma } from '@/server/db';
import { decryptSecret, maskCredentialsObject } from '@/server/crypto/encryption';
import { handleApiError } from '@/shared/errors';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'integrations.manage');

    const integrations = await prisma.integration.findMany({
      where: { workspaceId: session.workspaceId },
      orderBy: { provider: 'asc' },
    });

    const PROVIDER_METADATA: Record<string, { name: string; limits: string; testModeNotice: string }> = {
      TWILIO: {
        name: 'Twilio WhatsApp & SMS',
        limits: 'Twilio Sandbox only reaches phones that have sent the join phrase to the sandbox number.',
        testModeNotice: 'Using WhatsApp sandbox mode. Messages to unjoined numbers are rejected by Twilio.',
      },
      WHATSAPP_CLOUD: {
        name: 'WhatsApp Cloud API',
        limits: 'Free-form replies are available within the customer service window; approved templates are required to initiate conversations outside it.',
        testModeNotice: 'Messages are sent through Meta WhatsApp Cloud API using the configured business phone number.',
      },
      SAFEPAY: {
        name: 'SafePay Payments',
        limits: 'Checkout uses SafePay hosted payments. Configure separate public API, private API, and webhook signing keys.',
        testModeNotice: 'Sandbox mode is active. No live charges are created.',
      },
      GOOGLE_CALENDAR: {
        name: 'Google Calendar (OAuth 2.0)',
        limits: 'An app in Google testing status only accepts listed test user accounts and may issue short-lived refresh tokens.',
        testModeNotice: 'Requires test accounts to be added in Google Cloud Console OAuth consent screen.',
      },
      TELEGRAM: {
        name: 'Telegram Alerts',
        limits: 'Alerts require employees to have started a chat with the bot and supplied their telegramDestination chat ID.',
        testModeNotice: 'Bot token stored encrypted on server. Used for instant lead escalation notifications.',
      },
    };

    const sanitized = integrations.map((item) => {
      let maskedCredentials: Record<string, string> = {};
      if (item.credentialsEncrypted) {
        try {
          const raw = JSON.parse(decryptSecret(item.credentialsEncrypted));
          maskedCredentials = maskCredentialsObject(raw);
        } catch {
          maskedCredentials = { status: 'ENCRYPTED' };
        }
      }

      const meta = PROVIDER_METADATA[item.provider] || {
        name: item.provider,
        limits: '',
        testModeNotice: '',
      };

      return {
        id: item.id,
        provider: item.provider,
        name: meta.name,
        status: item.status,
        lastWorkedAt: item.lastWorkedAt,
        lastError: item.lastError,
        limits: meta.limits, // (I5.6)
        testModeNotice: meta.testModeNotice,
        maskedCredentials, // (I5.3)
        config: item.config,
      };
    });

    return NextResponse.json({ integrations: sanitized });
  } catch (err) {
    return handleApiError(err);
  }
}

