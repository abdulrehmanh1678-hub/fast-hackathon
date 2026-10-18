import { NextRequest } from 'next/server';
import { requireAuth } from '@/server/auth/rbac';
import { registerSSEClient, unregisterSSEClient } from '@/server/lead-engine/sse';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const clientId = `${session.userId}-${Date.now()}`;

    const stream = new ReadableStream({
      start(controller) {
        registerSSEClient(clientId, session.workspaceId, controller);

        // Send initial connection handshake
        const handshake = `event: connected\ndata: ${JSON.stringify({
          connected: true,
          clientId,
          workspaceId: session.workspaceId,
        })}\n\n`;
        controller.enqueue(new TextEncoder().encode(handshake));
      },
      cancel() {
        unregisterSSEClient(clientId);
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: err.message } }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
