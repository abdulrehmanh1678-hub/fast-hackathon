import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/server/auth/rbac';
import { createScopedDAL } from '@/server/dal';
import { ContactUpdateSchema } from '@/shared/schemas';
import { recordAuditEvent } from '@/server/audit/audit-helper';
import { handleApiError, AppError } from '@/shared/errors';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'crm.view');

    const dal = createScopedDAL(session.workspaceId);
    // Complete 360 customer view (F2.8)
    const contact = await dal.getContactById(params.id);

    if (!contact) throw new AppError('NOT_FOUND', 'Contact not found', 404);

    return NextResponse.json({ contact });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'crm.edit');

    const body = await req.json();
    const input = ContactUpdateSchema.parse(body);

    const dal = createScopedDAL(session.workspaceId);
    const existing = await dal.getContactById(params.id);
    if (!existing) throw new AppError('NOT_FOUND', 'Contact not found', 404);

    const updated = await dal.updateContact(params.id, input);

    await recordAuditEvent({
      workspaceId: session.workspaceId,
      actorId: session.userId,
      eventType: 'CONTACT_UPDATED',
      targetType: 'contact',
      targetId: params.id,
      beforeValue: { optOut: existing.optOut, phone: existing.phone, email: existing.email },
      afterValue: { optOut: updated.optOut, phone: updated.phone, email: updated.email },
    });

    return NextResponse.json({ success: true, contact: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
