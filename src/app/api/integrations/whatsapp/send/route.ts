import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/server/auth/rbac';
import { MessageSendSchema } from '@/shared/schemas';
import { sendWhatsAppCloudMessage } from '@/server/integrations/whatsapp-cloud';
import { handleApiError } from '@/shared/errors';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'crm.create');
    const input = MessageSendSchema.parse(await req.json());
    const message = await sendWhatsAppCloudMessage({
      workspaceId: session.workspaceId,
      contactId: input.contactId,
      body: input.body,
      senderUserId: session.userId,
    });
    return NextResponse.json({ success: true, message }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
