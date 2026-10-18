/**
 * Server-Sent Events (SSE) broadcaster for real-time lead & escalation notifications (Q11)
 */

type SSEClient = {
  id: string;
  workspaceId: string;
  controller: ReadableStreamDefaultController;
};

const clients: SSEClient[] = [];

export function registerSSEClient(id: string, workspaceId: string, controller: ReadableStreamDefaultController) {
  clients.push({ id, workspaceId, controller });
}

export function unregisterSSEClient(id: string) {
  const index = clients.findIndex((c) => c.id === id);
  if (index !== -1) {
    clients.splice(index, 1);
  }
}

export function broadcastSSEEvent(workspaceId: string, eventType: string, data: any) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  const encoder = new TextEncoder();
  const encoded = encoder.encode(payload);

  for (const client of clients) {
    if (client.workspaceId === workspaceId) {
      try {
        client.controller.enqueue(encoded);
      } catch {
        // Closed stream
      }
    }
  }
}
