import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/server/auth/rbac';
import { prisma } from '@/server/db';
import { handleApiError } from '@/shared/errors';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'crm.view');

    const payments = await prisma.payment.findMany({
      where: { workspaceId: session.workspaceId },
      include: {
        contact: { select: { firstName: true, lastName: true } },
        opportunity: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({ payments });
  } catch (err) {
    return handleApiError(err);
  }
}
