import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/server/auth/rbac';
import { createScopedDAL } from '@/server/dal';
import { CustomFieldCreateSchema } from '@/shared/schemas';
import { recordAuditEvent } from '@/server/audit/audit-helper';
import { handleApiError } from '@/shared/errors';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'crm.view');

    const pipelineId = req.nextUrl.searchParams.get('pipelineId') || undefined;
    const dal = createScopedDAL(session.workspaceId);
    const customFields = await dal.getCustomFields(pipelineId);

    return NextResponse.json({ customFields });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'crm.create');

    const body = await req.json();
    const input = CustomFieldCreateSchema.parse(body);

    const dal = createScopedDAL(session.workspaceId);
    const customField = await dal.createCustomField(input);

    await recordAuditEvent({
      workspaceId: session.workspaceId,
      actorId: session.userId,
      eventType: 'CUSTOM_FIELD_CREATED',
      targetType: 'custom_field',
      targetId: customField.id,
      afterValue: { key: customField.key, name: customField.name, type: customField.type, pipelineId: customField.pipelineId },
    });

    return NextResponse.json({ success: true, customField }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
