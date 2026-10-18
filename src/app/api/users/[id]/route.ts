import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, assertCanModifyUser } from '@/server/auth/rbac';
import { createScopedDAL } from '@/server/dal';
import { UserUpdateSchema } from '@/shared/schemas';
import { recordAuditEvent } from '@/server/audit/audit-helper';
import { reassignUnacknowledgedLeadsForUser } from '@/server/lead-engine/escalation';
import { handleApiError, AppError } from '@/shared/errors';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAuth(req);
    const targetUserId = params.id;

    const dal = createScopedDAL(session.workspaceId);
    const targetUser = await dal.getUserById(targetUserId);
    if (!targetUser) throw new AppError('NOT_FOUND', 'Target user not found in workspace', 404);

    // Rule: Admin cannot modify Owner [F1.2]
    assertCanModifyUser(session, targetUser);

    const body = await req.json();
    const input = UserUpdateSchema.parse(body);

    const prevAvailability = targetUser.availabilityStatus;
    const newAvailability = input.availabilityStatus;

    const updatedUser = await dal.updateUser(targetUserId, {
      name: input.name ?? targetUser.name,
      availabilityStatus: newAvailability ?? targetUser.availabilityStatus,
      maxOpenLeads: input.maxOpenLeads ?? targetUser.maxOpenLeads,
      telegramDestination: input.telegramDestination !== undefined ? input.telegramDestination : targetUser.telegramDestination,
      role: input.role && session.role === 'OWNER' ? input.role : targetUser.role,
    });

    // Requirement F3.6: Setting an employee to On leave or Offline immediately reassigns unacknowledged leads!
    let reassignedCount = 0;
    if (
      newAvailability &&
      (newAvailability === 'ON_LEAVE' || newAvailability === 'OFFLINE') &&
      prevAvailability !== newAvailability
    ) {
      reassignedCount = await reassignUnacknowledgedLeadsForUser(session.workspaceId, targetUserId);
    }

    // Audit log (F4.1)
    await recordAuditEvent({
      workspaceId: session.workspaceId,
      actorId: session.userId,
      eventType: 'USER_UPDATED',
      targetType: 'user',
      targetId: targetUserId,
      beforeValue: {
        name: targetUser.name,
        availabilityStatus: prevAvailability,
        maxOpenLeads: targetUser.maxOpenLeads,
      },
      afterValue: {
        name: updatedUser.name,
        availabilityStatus: updatedUser.availabilityStatus,
        maxOpenLeads: updatedUser.maxOpenLeads,
        reassignedLeadsOnAbsence: reassignedCount,
      },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        availabilityStatus: updatedUser.availabilityStatus,
        maxOpenLeads: updatedUser.maxOpenLeads,
        telegramDestination: updatedUser.telegramDestination,
      },
      reassignedLeadsOnAbsence: reassignedCount,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
