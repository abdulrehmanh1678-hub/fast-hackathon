import { processExpiredLeadsBatch } from '@/server/lead-engine/escalation';

const POLL_INTERVAL_MS = Number(process.env.ESCALATION_POLL_INTERVAL_MS || 5000);

let isRunning = true;

async function runWorkerLoop() {
  console.log(`[Escalation Worker] Starting background worker loop (interval: ${POLL_INTERVAL_MS}ms)...`);

  while (isRunning) {
    try {
      const processed = await processExpiredLeadsBatch(20);
      if (processed > 0) {
        console.log(`[Escalation Worker] Processed ${processed} expired lead(s) via FOR UPDATE SKIP LOCKED.`);
      }
    } catch (err) {
      console.error('[Escalation Worker] Polling cycle error:', err);
    }

    // Wait for the next poll cycle using an async sleep promise
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  console.log('[Escalation Worker] Worker loop stopped gracefully.');
}

// Graceful shutdown handling
process.on('SIGINT', () => {
  console.log('[Escalation Worker] Received SIGINT. Shutting down...');
  isRunning = false;
});

process.on('SIGTERM', () => {
  console.log('[Escalation Worker] Received SIGTERM. Shutting down...');
  isRunning = false;
});

runWorkerLoop();
