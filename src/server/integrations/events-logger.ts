import { prisma } from '@/server/db';
import { IntegrationProvider, IntegrationEventResult } from '@prisma/client';

export interface LogIntegrationEventParams {
  workspaceId: string;
  provider: IntegrationProvider;
  eventType: string; // "INBOUND_WEBHOOK", "OUTBOUND_SEND", "CHECKOUT_CREATED", "PAYMENT_CONFIRMED", "CALENDAR_SYNC"
  providerEventId?: string | null;
  result: IntegrationEventResult;
  reference?: string | null;
  requestPayload?: any;
  responsePayload?: any;
  errorMessage?: string | null;
}

/**
 * Log all inbound and outbound integration calls in integration_events (Rule 7, I5.1, I5.4)
 */
export async function logIntegrationEvent(params: LogIntegrationEventParams) {
  try {
    const event = await prisma.integrationEvent.create({
      data: {
        workspaceId: params.workspaceId,
        provider: params.provider,
        eventType: params.eventType,
        providerEventId: params.providerEventId ?? null,
        result: params.result,
        reference: params.reference ?? null,
        requestPayload: params.requestPayload ? JSON.parse(JSON.stringify(params.requestPayload)) : undefined,
        responsePayload: params.responsePayload ? JSON.parse(JSON.stringify(params.responsePayload)) : undefined,
        errorMessage: params.errorMessage ?? null,
      },
    });

    // Update integration health status
    await prisma.integration.upsert({
      where: {
        workspaceId_provider: {
          workspaceId: params.workspaceId,
          provider: params.provider,
        },
      },
      update: {
        lastWorkedAt: params.result === 'SUCCESS' ? new Date() : undefined,
        lastError: params.result === 'FAILED' ? params.errorMessage ?? 'Integration call failed' : undefined,
        status: params.result === 'FAILED' ? 'ERROR' : 'CONNECTED',
      },
      create: {
        workspaceId: params.workspaceId,
        provider: params.provider,
        status: params.result === 'FAILED' ? 'ERROR' : 'CONNECTED',
        lastWorkedAt: params.result === 'SUCCESS' ? new Date() : undefined,
        lastError: params.result === 'FAILED' ? params.errorMessage ?? 'Integration call failed' : undefined,
      },
    });

    return event;
  } catch (err: any) {
    console.error('Failed to log integration event:', err);
    return null;
  }
}
