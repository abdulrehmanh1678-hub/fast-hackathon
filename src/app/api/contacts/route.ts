import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/server/auth/rbac';
import { createScopedDAL } from '@/server/dal';
import { ContactCreateSchema } from '@/shared/schemas';
import { recordAuditEvent } from '@/server/audit/audit-helper';
import { handleApiError } from '@/shared/errors';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'crm.view');

    const searchParams = req.nextUrl.searchParams;
    const query = searchParams.get('q') || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0;

    const dal = createScopedDAL(session.workspaceId);
    const result = await dal.getContacts({ query, limit, offset });

    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'crm.create');

    const body = await req.json();
    const input = ContactCreateSchema.parse(body);

    const dal = createScopedDAL(session.workspaceId);
    const contact = await dal.createContact(input);

    await recordAuditEvent({
      workspaceId: session.workspaceId,
      actorId: session.userId,
      eventType: 'CONTACT_CREATED',
      targetType: 'contact',
      targetId: contact.id,
      afterValue: { firstName: contact.firstName, lastName: contact.lastName, email: contact.email, phone: contact.phone },
    });

    return NextResponse.json({ success: true, contact }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
