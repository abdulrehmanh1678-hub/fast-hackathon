import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/server/auth/rbac';
import { prisma } from '@/server/db';
import { handleApiError } from '@/shared/errors';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'crm.view');

    // Conversation visible only to permitted users, with its assigned employee (I1.6)
    const isPersonalScope = session.role === 'USER';

    const conversations = await prisma.conversation.findMany({
      where: {
        workspaceId: session.workspaceId,
        ...(isPersonalScope ? { assignedUserId: session.userId } : {}),
      },
      include: {
        contact: true,
        assignedUser: { select: { id: true, name: true, email: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 30,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({ conversations });
  } catch (err) {
    return handleApiError(err);
  }
}
