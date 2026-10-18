import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db';
import { SignupSchema } from '@/shared/schemas';
import { hashPassword, createSession, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '@/server/auth/session';
import { recordAuditEvent } from '@/server/audit/audit-helper';
import { handleApiError, AppError } from '@/shared/errors';
import { ALL_PERMISSIONS } from '@/shared/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = SignupSchema.parse(body);

    // Check if workspace slug or user email already taken
    const [existingSlug, existingEmail] = await Promise.all([
      prisma.workspace.findUnique({ where: { slug: input.workspaceSlug } }),
      prisma.user.findUnique({ where: { email: input.email.toLowerCase() } }),
    ]);

    if (existingSlug) {
      throw new AppError('SLUG_TAKEN', 'Workspace slug is already taken. Please choose another.', 409);
    }
    if (existingEmail) {
      throw new AppError('EMAIL_TAKEN', 'An account with this email address already exists.', 409);
    }

    const passwordHash = await hashPassword(input.password);

    // Create workspace, Owner, all permissions, default pipeline, and stages in a transaction (F1.1)
    const result = await prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          name: input.companyName,
          slug: input.workspaceSlug,
          workspaceId: 'init', // Updated right after
          settings: {
            ackWindowSeconds: 300,
            escalationTimeoutSeconds: 300,
            maxOpenLeadsDefault: 10,
          },
        },
      });

      // Update workspaceId to match id
      await tx.workspace.update({
        where: { id: workspace.id },
        data: { workspaceId: workspace.id },
      });

      const owner = await tx.user.create({
        data: {
          workspaceId: workspace.id,
          email: input.email.toLowerCase(),
          passwordHash,
          name: input.name,
          role: 'OWNER',
          availabilityStatus: 'AVAILABLE',
          maxOpenLeads: 20,
        },
      });

      // Grant all permissions to the Owner as rows (Rule 2)
      await tx.permission.createMany({
        data: ALL_PERMISSIONS.map((action) => ({
          workspaceId: workspace.id,
          userId: owner.id,
          action,
        })),
      });

      // Default Pipeline
      const pipeline = await tx.pipeline.create({
        data: {
          workspaceId: workspace.id,
          name: 'Standard Pipeline',
          isDefault: true,
        },
      });

      // Default Stages
      await tx.stage.createMany({
        data: [
          { workspaceId: workspace.id, pipelineId: pipeline.id, name: 'Lead', order: 0 },
          { workspaceId: workspace.id, pipelineId: pipeline.id, name: 'Qualified', order: 1 },
          { workspaceId: workspace.id, pipelineId: pipeline.id, name: 'Meeting', order: 2 },
          { workspaceId: workspace.id, pipelineId: pipeline.id, name: 'Proposal', order: 3 },
          { workspaceId: workspace.id, pipelineId: pipeline.id, name: 'Closed Won', order: 4, isWon: true },
          { workspaceId: workspace.id, pipelineId: pipeline.id, name: 'Closed Lost', order: 5, isLost: true },
        ],
      });

      return { workspace, owner };
    });

    // Create session and set httpOnly cookie (F1.1, Q1)
    const sessionToken = await createSession(result.owner.id, result.workspace.id);

    await recordAuditEvent({
      workspaceId: result.workspace.id,
      actorId: result.owner.id,
      eventType: 'WORKSPACE_SIGNUP',
      targetType: 'workspace',
      targetId: result.workspace.id,
      afterValue: { slug: result.workspace.slug, ownerEmail: result.owner.email },
    });

    const response = NextResponse.json(
      {
        success: true,
        workspace: { id: result.workspace.id, name: result.workspace.name, slug: result.workspace.slug },
        user: { id: result.owner.id, email: result.owner.email, name: result.owner.name, role: result.owner.role },
      },
      { status: 201 }
    );

    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return response;
  } catch (err) {
    return handleApiError(err);
  }
}
