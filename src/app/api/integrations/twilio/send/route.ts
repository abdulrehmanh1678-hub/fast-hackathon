import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/server/auth/rbac';
import { MessageSendSchema } from '@/shared/schemas';
import { sendOutboundTwilioMessage } from '@/server/integrations/twilio';
import { handleApiError } from '@/shared/errors';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'crm.create');

    const body = await req.json();
    const input = MessageSendSchema.parse(body);

    const message = await sendOutboundTwilioMessage({
      workspaceId: session.workspaceId,
      contactId: input.contactId,
      body: input.body,
      senderUserId: session.userId,
    });

    return NextResponse.json({ success: true, message }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
