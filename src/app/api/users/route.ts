import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/server/auth/rbac';
import { prisma } from '@/server/db';
import { createScopedDAL } from '@/server/dal';
import { UserInviteSchema } from '@/shared/schemas';
import { hashPassword } from '@/server/auth/session';
import { recordAuditEvent } from '@/server/audit/audit-helper';
import { handleApiError, AppError } from '@/shared/errors';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const dal = createScopedDAL(session.workspaceId);
    const users = await dal.getUsers();

    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        availabilityStatus: u.availabilityStatus,
        maxOpenLeads: u.maxOpenLeads,
        telegramDestination: u.telegramDestination,
        permissions: u.permissions.map((p) => p.action),
        createdAt: u.createdAt,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);

    // Only OWNER or ADMIN can invite/create users (F1.2)
    if (session.role === 'USER') {
      throw new AppError('FORBIDDEN', 'Only Workspace Owners and Admins can add team members', 403);
    }

    const body = await req.json();
    const input = UserInviteSchema.parse(body);

    const existingUser = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    if (existingUser) {
      throw new AppError('EMAIL_TAKEN', 'A user with this email address already exists', 409);
    }

    const passwordHash = await hashPassword(input.password);

    const newUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          workspaceId: session.workspaceId,
          email: input.email.toLowerCase(),
          passwordHash,
          name: input.name,
          role: input.role,
          availabilityStatus: input.availabilityStatus,
          maxOpenLeads: input.maxOpenLeads,
          telegramDestination: input.telegramDestination ?? null,
        },
      });

      const initialPermissions = input.permissions || ['crm.view'];
      if (initialPermissions.length > 0) {
        await tx.permission.createMany({
          data: initialPermissions.map((action) => ({
            workspaceId: session.workspaceId,
            userId: user.id,
            action,
          })),
        });
      }

      return user;
    });

    await recordAuditEvent({
      workspaceId: session.workspaceId,
      actorId: session.userId,
      eventType: 'USER_INVITED',
      targetType: 'user',
      targetId: newUser.id,
      afterValue: { email: newUser.email, role: newUser.role, permissions: input.permissions },
    });

    return NextResponse.json(
      {
        success: true,
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          role: newUser.role,
          availabilityStatus: newUser.availabilityStatus,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    return handleApiError(err);
  }
}
