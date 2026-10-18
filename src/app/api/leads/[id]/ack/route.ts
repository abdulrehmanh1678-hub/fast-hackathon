import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/server/auth/rbac';
import { acknowledgeLead } from '@/server/lead-engine/assignment';
import { LeadAcknowledgeSchema } from '@/shared/schemas';
import { handleApiError } from '@/shared/errors';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAuth(req);

    let note: string | undefined;
    try {
      const body = await req.json();
      const parsed = LeadAcknowledgeSchema.safeParse(body);
      if (parsed.success) note = parsed.data.note;
    } catch {
      // Empty body is acceptable for direct ack
    }

    const lead = await acknowledgeLead({
      workspaceId: session.workspaceId,
      leadId: params.id,
      actorId: session.userId,
      actionType: 'DIRECT_ACK',
      note,
    });

    return NextResponse.json({
      success: true,
      message: 'Lead acknowledged successfully',
      lead,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
