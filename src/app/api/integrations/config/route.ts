import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/server/auth/rbac';
import { prisma } from '@/server/db';
import { IntegrationSaveConfigSchema } from '@/shared/schemas';
import { encryptSecret } from '@/server/crypto/encryption';
import { recordAuditEvent } from '@/server/audit/audit-helper';
import { handleApiError } from '@/shared/errors';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requirePermission(session, 'integrations.manage');

    const body = await req.json();
    const input = IntegrationSaveConfigSchema.parse(body);

    // Encrypt credentials server-side with AES-256-GCM (Rule 8, I5.3)
    const encryptedCredentials = encryptSecret(input.credentials);

    const integration = await prisma.integration.upsert({
      where: {
        workspaceId_provider: {
          workspaceId: session.workspaceId,
          provider: input.provider,
        },
      },
      update: {
        credentialsEncrypted: encryptedCredentials,
        config: (input.config as any) ?? undefined,
        status: 'CONNECTED',
        lastError: null,
      },
      create: {
        workspaceId: session.workspaceId,
        provider: input.provider,
        credentialsEncrypted: encryptedCredentials,
        config: (input.config as any) ?? undefined,
        status: 'CONNECTED',
      },
    });

    // Audit log (F4.1, I5.7)
    await recordAuditEvent({
      workspaceId: session.workspaceId,
      actorId: session.userId,
      eventType: 'INTEGRATION_CONFIGURED',
      targetType: 'integration',
      targetId: integration.id,
      afterValue: { provider: input.provider, status: 'CONNECTED' },
    });

    return NextResponse.json({
      success: true,
      message: `${input.provider} credentials securely encrypted and saved`,
      provider: input.provider,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
