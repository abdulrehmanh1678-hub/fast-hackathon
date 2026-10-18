import { prisma } from '@/server/db';
import { logIntegrationEvent } from '@/server/integrations/events-logger';

export interface EscalationAlertPayload {
  workspaceId: string;
  leadId: string;
  leadTitle: string;
  source: string;
  escalationLevel: number;
  reason: string;
  assigneeId: string;
  assigneeName: string;
  destination: string; // e.g. Telegram chat ID or username
  leadUrl: string;
}

export interface NotificationProvider {
  name: string;
  sendEscalationAlert(payload: EscalationAlertPayload): Promise<boolean>;
}

export class TelegramNotificationProvider implements NotificationProvider {
  name = 'Telegram';

  async sendEscalationAlert(payload: EscalationAlertPayload): Promise<boolean> {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const message =
      `🚨 *LEAD ESCALATION ALERT* (Level ${payload.escalationLevel})\n\n` +
      `*Lead:* ${payload.leadTitle}\n` +
      `*Source:* ${payload.source}\n` +
      `*Assigned To:* ${payload.assigneeName}\n` +
      `*Reason:* ${payload.reason}\n\n` +
      `🔗 [Open Lead in CRM](${payload.leadUrl})`;

    if (!botToken || botToken.startsWith('dummy_')) {
      console.log(`[NotificationProvider:Telegram] (Simulation Mode) To: ${payload.destination}`);
      console.log(message);

      await logIntegrationEvent({
        workspaceId: payload.workspaceId,
        provider: 'TELEGRAM',
        eventType: 'LEAD_ESCALATION_ALERT',
        result: 'SUCCESS',
        reference: payload.leadId,
        requestPayload: { destination: payload.destination, text: message },
        responsePayload: { simulated: true, ok: true },
      });

      return true;
    }

    try {
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: payload.destination,
          text: message,
          parse_mode: 'Markdown',
        }),
      });

      const data = await res.json();
      const success = res.ok && data.ok;

      await logIntegrationEvent({
        workspaceId: payload.workspaceId,
        provider: 'TELEGRAM',
        eventType: 'LEAD_ESCALATION_ALERT',
        result: success ? 'SUCCESS' : 'FAILED',
        reference: payload.leadId,
        requestPayload: { destination: payload.destination },
        responsePayload: data,
        errorMessage: success ? null : data.description || 'Telegram API request failed',
      });

      return success;
    } catch (err: any) {
      console.error('Telegram send failure:', err);

      await logIntegrationEvent({
        workspaceId: payload.workspaceId,
        provider: 'TELEGRAM',
        eventType: 'LEAD_ESCALATION_ALERT',
        result: 'FAILED',
        reference: payload.leadId,
        errorMessage: err.message,
      });

      return false;
    }
  }
}

// Default export active notification provider instance
export const activeNotificationProvider: NotificationProvider = new TelegramNotificationProvider();
