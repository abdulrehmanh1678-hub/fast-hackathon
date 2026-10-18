import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/server/auth/rbac';
import { createScopedDAL } from '@/server/dal';
import { CompanyCreateSchema } from '@/shared/schemas';
import { recordAuditEvent } from '@/server/audit/audit-helper';
import { handleApiError } from '@/shared/errors';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'crm.view');

    const dal = createScopedDAL(session.workspaceId);
    const companies = await dal.getCompanies();

    return NextResponse.json({ companies });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'crm.create');

    const body = await req.json();
    const input = CompanyCreateSchema.parse(body);

    const dal = createScopedDAL(session.workspaceId);
    const company = await dal.createCompany(input);

    await recordAuditEvent({
      workspaceId: session.workspaceId,
      actorId: session.userId,
      eventType: 'COMPANY_CREATED',
      targetType: 'company',
      targetId: company.id,
      afterValue: { name: company.name, domain: company.domain },
    });

    return NextResponse.json({ success: true, company }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
