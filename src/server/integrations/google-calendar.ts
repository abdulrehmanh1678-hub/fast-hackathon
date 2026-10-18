import { google } from 'googleapis';
import { prisma } from '@/server/db';
import { logIntegrationEvent } from '@/server/integrations/events-logger';
import { encryptSecret, decryptSecret } from '@/server/crypto/encryption';
import { AppError } from '@/shared/errors';

export function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID || 'dummy_client_id';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || 'dummy_client_secret';
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/integrations/google/callback';

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Generate Google OAuth consent URL (I3.1)
 */
export function getGoogleAuthUrl(workspaceId: string, userId: string): string {
  const oauth2Client = getOAuth2Client();
  const state = Buffer.from(JSON.stringify({ workspaceId, userId })).toString('base64');

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.freebusy'],
    state,
  });
}

/**
 * Exchange code for tokens, encrypt tokens on server, and mark integration connected (I3.1, I3.2)
 */
export async function handleGoogleOAuthCallback(code: string, state: string) {
  let decodedState: { workspaceId: string; userId: string };
  try {
    decodedState = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
  } catch {
    throw new AppError('INVALID_STATE', 'Invalid OAuth state parameter', 400);
  }

  const { workspaceId, userId } = decodedState;
  const oauth2Client = getOAuth2Client();

  if (process.env.GOOGLE_CLIENT_ID?.startsWith('dummy_')) {
    // Simulated token in test mode
    const dummyTokens = {
      access_token: `ya29.sim_${Date.now()}`,
      refresh_token: `1//sim_refresh_${Date.now()}`,
      expiry_date: Date.now() + 3600 * 1000,
    };
    const encrypted = encryptSecret(dummyTokens);

    await prisma.integration.upsert({
      where: {
        workspaceId_provider: {
          workspaceId,
          provider: 'GOOGLE_CALENDAR',
        },
      },
      update: {
        status: 'CONNECTED',
        credentialsEncrypted: encrypted,
        config: { connectedByUserId: userId, connectedAt: new Date().toISOString() },
        lastWorkedAt: new Date(),
        lastError: null,
      },
      create: {
        workspaceId,
        provider: 'GOOGLE_CALENDAR',
        status: 'CONNECTED',
        credentialsEncrypted: encrypted,
        config: { connectedByUserId: userId, connectedAt: new Date().toISOString() },
        lastWorkedAt: new Date(),
      },
    });

    await logIntegrationEvent({
      workspaceId,
      provider: 'GOOGLE_CALENDAR',
      eventType: 'OAUTH_CONNECTED',
      result: 'SUCCESS',
      reference: userId,
      responsePayload: { simulated: true },
    });

    return { success: true, workspaceId };
  }

  const { tokens } = await oauth2Client.getToken(code);
  const encrypted = encryptSecret(tokens);

  await prisma.integration.upsert({
    where: {
      workspaceId_provider: {
        workspaceId,
        provider: 'GOOGLE_CALENDAR',
      },
    },
    update: {
      status: 'CONNECTED',
      credentialsEncrypted: encrypted,
      config: { connectedByUserId: userId, connectedAt: new Date().toISOString() },
      lastWorkedAt: new Date(),
      lastError: null,
    },
    create: {
      workspaceId,
      provider: 'GOOGLE_CALENDAR',
      status: 'CONNECTED',
      credentialsEncrypted: encrypted,
      config: { connectedByUserId: userId, connectedAt: new Date().toISOString() },
      lastWorkedAt: new Date(),
    },
  });

  await logIntegrationEvent({
    workspaceId,
    provider: 'GOOGLE_CALENDAR',
    eventType: 'OAUTH_CONNECTED',
    result: 'SUCCESS',
    reference: userId,
  });

  return { success: true, workspaceId };
}

/**
 * Disconnect Google Calendar integration (I3.1)
 */
export async function disconnectGoogleCalendar(workspaceId: string, actorId: string) {
  await prisma.integration.updateMany({
    where: { workspaceId, provider: 'GOOGLE_CALENDAR' },
    data: {
      status: 'DISCONNECTED',
      credentialsEncrypted: null,
      config: undefined,
    },
  });

  await logIntegrationEvent({
    workspaceId,
    provider: 'GOOGLE_CALENDAR',
    eventType: 'OAUTH_DISCONNECTED',
    result: 'SUCCESS',
    reference: actorId,
  });
}

/**
 * Get authenticated Calendar client with automatic token refresh (I3.2)
 */
export async function getAuthenticatedCalendar(workspaceId: string) {
  const integration = await prisma.integration.findUnique({
    where: {
      workspaceId_provider: {
        workspaceId,
        provider: 'GOOGLE_CALENDAR',
      },
    },
  });

  if (!integration || integration.status !== 'CONNECTED' || !integration.credentialsEncrypted) {
    throw new AppError(
      'CALENDAR_NOT_CONNECTED',
      'Google Calendar is not connected. Please connect your Google Calendar in Integrations.',
      400
    );
  }

  const tokens = JSON.parse(decryptSecret(integration.credentialsEncrypted));
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(tokens);

  // Automatic token refresh listener (I3.2)
  oauth2Client.on('tokens', async (newTokens) => {
    const updatedTokens = { ...tokens, ...newTokens };
    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        credentialsEncrypted: encryptSecret(updatedTokens),
        lastWorkedAt: new Date(),
      },
    });
  });

  return { calendar: google.calendar({ version: 'v3', auth: oauth2Client }), isSimulated: tokens.access_token.includes('sim_') };
}

/**
 * Check freebusy busy times for calendar to avoid conflicts (I3.4)
 */
export async function checkFreeBusy(params: {
  workspaceId: string;
  timeMin: string; // ISO string
  timeMax: string; // ISO string
  timeZone: string;
}) {
  const { workspaceId, timeMin, timeMax, timeZone } = params;

  try {
    const { calendar, isSimulated } = await getAuthenticatedCalendar(workspaceId);

    if (isSimulated) {
      return { busy: [] };
    }

    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        timeZone,
        items: [{ id: 'primary' }],
      },
    });

    return { busy: res.data.calendars?.primary?.busy || [] };
  } catch (err: any) {
    if (err.message?.includes('invalid_grant')) {
      // Revoked connection detected (I3.2)
      await prisma.integration.updateMany({
        where: { workspaceId, provider: 'GOOGLE_CALENDAR' },
        data: { status: 'ERROR', lastError: 'Google account access has been revoked or expired. Please reconnect.' },
      });
      throw new AppError('GOOGLE_REVOKED', 'Google connection revoked. Please reconnect.', 401);
    }
    throw err;
  }
}

/**
 * Create an appointment in DB and on Google Calendar (I3.3, I3.5)
 * Times are stored in UTC along with the IANA time zone (I3.5)
 */
export async function createCalendarAppointment(params: {
  workspaceId: string;
  hostUserId: string;
  contactId?: string | null;
  opportunityId?: string | null;
  title: string;
  description?: string;
  startTime: string; // ISO UTC string
  endTime: string;   // ISO UTC string
  timeZone: string;  // IANA
}) {
  const { workspaceId, hostUserId, contactId, opportunityId, title, description, startTime, endTime, timeZone } = params;

  // 1. Conflict avoidance: Check freebusy (I3.4)
  const freeBusy = await checkFreeBusy({
    workspaceId,
    timeMin: startTime,
    timeMax: endTime,
    timeZone,
  });

  if (freeBusy.busy.length > 0) {
    throw new AppError(
      'CALENDAR_CONFLICT',
      'The requested appointment time conflicts with an existing busy event on the host calendar.',
      409,
      { busySlots: (freeBusy.busy || []).map((b) => `${b.start} - ${b.end}`) }
    );
  }

  // 2. Fetch contact info if present
  let contact = null;
  if (contactId) {
    contact = await prisma.contact.findFirst({
      where: { id: contactId, workspaceId },
    });
  }

  // 3. Create on Google Calendar (I3.3)
  const { calendar, isSimulated } = await getAuthenticatedCalendar(workspaceId);
  let googleEventId = `gevent_${Date.now()}`;

  if (!isSimulated) {
    const eventRes = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: title,
        description,
        start: { dateTime: startTime, timeZone },
        end: { dateTime: endTime, timeZone },
        attendees: contact?.email ? [{ email: contact.email }] : undefined,
      },
    });
    if (eventRes.data.id) {
      googleEventId = eventRes.data.id;
    }
  }

  // 4. Store in platform DB (I3.3, I3.5)
  const appointment = await prisma.appointment.create({
    data: {
      workspaceId,
      hostUserId,
      contactId: contactId ?? null,
      opportunityId: opportunityId ?? null,
      title,
      description,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      timeZone,
      googleEventId,
      status: 'SCHEDULED',
    },
    include: { hostUser: true, contact: true },
  });

  // 5. Activity log (I3.3)
  await prisma.activity.create({
    data: {
      workspaceId,
      contactId: contactId ?? null,
      opportunityId: opportunityId ?? null,
      actorId: hostUserId,
      type: 'APPOINTMENT',
      description: `Appointment scheduled: '${title}' on ${new Date(startTime).toUTCString()} (${timeZone})`,
      metadata: { googleEventId, appointmentId: appointment.id },
    },
  });

  await logIntegrationEvent({
    workspaceId,
    provider: 'GOOGLE_CALENDAR',
    eventType: 'EVENT_CREATED',
    providerEventId: googleEventId,
    result: 'SUCCESS',
    reference: appointment.id,
  });

  return appointment;
}

/**
 * Reschedule or cancel appointment (I3.6)
 */
export async function updateCalendarAppointment(params: {
  workspaceId: string;
  appointmentId: string;
  actorId: string;
  title?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  timeZone?: string;
  status?: 'SCHEDULED' | 'RESCHEDULED' | 'CANCELLED';
}) {
  const { workspaceId, appointmentId, actorId, title, description, startTime, endTime, timeZone, status } = params;

  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, workspaceId },
  });
  if (!appt) throw new AppError('NOT_FOUND', 'Appointment not found', 404);

  const { calendar, isSimulated } = await getAuthenticatedCalendar(workspaceId);

  if (!isSimulated && appt.googleEventId) {
    if (status === 'CANCELLED') {
      await calendar.events.delete({
        calendarId: 'primary',
        eventId: appt.googleEventId,
      });
    } else if (startTime || endTime || title) {
      await calendar.events.patch({
        calendarId: 'primary',
        eventId: appt.googleEventId,
        requestBody: {
          summary: title ?? appt.title,
          description: description !== undefined ? description : appt.description ?? undefined,
          start: startTime ? { dateTime: startTime, timeZone: timeZone ?? appt.timeZone } : undefined,
          end: endTime ? { dateTime: endTime, timeZone: timeZone ?? appt.timeZone } : undefined,
        },
      });
    }
  }

  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      title: title ?? appt.title,
      description: description !== undefined ? description : appt.description,
      startTime: startTime ? new Date(startTime) : appt.startTime,
      endTime: endTime ? new Date(endTime) : appt.endTime,
      timeZone: timeZone ?? appt.timeZone,
      status: status ?? (startTime ? 'RESCHEDULED' : appt.status),
    },
  });

  // Activity log (I3.6)
  await prisma.activity.create({
    data: {
      workspaceId,
      contactId: appt.contactId,
      opportunityId: appt.opportunityId,
      actorId,
      type: 'APPOINTMENT',
      description: status === 'CANCELLED' ? `Appointment cancelled: '${appt.title}'` : `Appointment updated / rescheduled: '${updated.title}'`,
      metadata: { appointmentId: appt.id, status: updated.status },
    },
  });

  return updated;
}
