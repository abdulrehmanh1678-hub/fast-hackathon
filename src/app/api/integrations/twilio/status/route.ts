import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db';
import { handleTwilioStatusCallback } from '@/server/integrations/twilio';
import { createErrorResponse } from '@/shared/errors';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const searchParams = new URLSearchParams(rawBody);
    const params: Record<string, string> = {};
    searchParams.forEach((val, key) => {
      params[key] = val;
    });

    const messageSid = params.MessageSid;
    const messageStatus = params.MessageStatus;
    const errorMessage = params.ErrorMessage;

    if (!messageSid || !messageStatus) {
      return createErrorResponse('INVALID_PAYLOAD', 'Missing MessageSid or MessageStatus', 400);
    }

    // Lookup workspace from message
    const message = await prisma.message.findUnique({
      where: { providerMessageId: messageSid },
    });

    if (message) {
      await handleTwilioStatusCallback({
        workspaceId: message.workspaceId,
        messageSid,
        messageStatus,
        errorMessage,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return createErrorResponse('STATUS_CALLBACK_ERROR', err.message, 500);
  }
}
