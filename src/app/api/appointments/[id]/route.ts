import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/server/auth/rbac';
import { AppointmentUpdateSchema } from '@/shared/schemas';
import { updateCalendarAppointment } from '@/server/integrations/google-calendar';
import { handleApiError } from '@/shared/errors';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'crm.edit');

    const body = await req.json();
    const input = AppointmentUpdateSchema.parse(body);

    const updated = await updateCalendarAppointment({
      workspaceId: session.workspaceId,
      appointmentId: params.id,
      actorId: session.userId,
      title: input.title,
      description: input.description,
      startTime: input.startTime,
      endTime: input.endTime,
      timeZone: input.timeZone,
      status: input.status,
    });

    return NextResponse.json({ success: true, appointment: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
