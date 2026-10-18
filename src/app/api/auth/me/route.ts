import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/server/auth/rbac';
import { prisma } from '@/server/db';
import { handleApiError } from '@/shared/errors';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: {
        workspace: {
          select: { id: true, name: true, slug: true, settings: true },
        },
        permissions: {
          select: { action: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, { status: 404 });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        availabilityStatus: user.availabilityStatus,
        maxOpenLeads: user.maxOpenLeads,
        telegramDestination: user.telegramDestination,
        permissions: user.permissions.map((p) => p.action),
      },
      workspace: user.workspace,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
