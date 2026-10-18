import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/server/auth/rbac';
import { prisma } from '@/server/db';
import { AppointmentCreateSchema } from '@/shared/schemas';
import { createCalendarAppointment } from '@/server/integrations/google-calendar';
import { handleApiError } from '@/shared/errors';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'crm.view');

    const hostUserId = req.nextUrl.searchParams.get('hostUserId') || (session.role === 'USER' ? session.userId : undefined);
    const contactId = req.nextUrl.searchParams.get('contactId') || undefined;

    const appointments = await prisma.appointment.findMany({
      where: {
        workspaceId: session.workspaceId,
        ...(hostUserId ? { hostUserId } : {}),
        ...(contactId ? { contactId } : {}),
      },
      include: { contact: true, hostUser: { select: { id: true, name: true, email: true } } },
      orderBy: { startTime: 'asc' },
    });

    return NextResponse.json({ appointments });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'crm.create');

    const body = await req.json();
    const input = AppointmentCreateSchema.parse(body);

    const appointment = await createCalendarAppointment({
      workspaceId: session.workspaceId,
      hostUserId: input.hostUserId,
      contactId: input.contactId ?? null,
      opportunityId: input.opportunityId ?? null,
      title: input.title,
      description: input.description,
      startTime: input.startTime,
      endTime: input.endTime,
      timeZone: input.timeZone,
    });

    return NextResponse.json({ success: true, appointment }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
