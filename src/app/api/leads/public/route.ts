import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db';
import { LeadCreatePublicSchema } from '@/shared/schemas';
import { createAndAssignLead } from '@/server/lead-engine/assignment';
import { handleApiError, AppError } from '@/shared/errors';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = LeadCreatePublicSchema.parse(body);

    // Identify target workspace via header or query param
    const slug = req.nextUrl.searchParams.get('workspace') || (body.workspaceSlug as string);
    if (!slug) {
      throw new AppError('WORKSPACE_REQUIRED', 'Workspace slug parameter is required for public intake', 400);
    }

    const workspace = await prisma.workspace.findUnique({
      where: { slug },
    });
    if (!workspace) {
      throw new AppError('NOT_FOUND', 'Workspace not found', 404);
    }

    // Match or create contact
    let contact = null;
    if (input.phone) {
      contact = await prisma.contact.findFirst({
        where: { workspaceId: workspace.id, phone: input.phone },
      });
    }

    if (!contact) {
      contact = await prisma.contact.create({
        data: {
          workspaceId: workspace.id,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email ?? null,
          phone: input.phone ?? null,
        },
      });
    }

    // Create and assign lead via round-robin with source label 'web_form' (F3.1, F3.3)
    const lead = await createAndAssignLead({
      workspaceId: workspace.id,
      title: input.title,
      source: 'web_form',
      contactId: contact.id,
      customFields: input.customFields ?? {},
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Lead received and assigned successfully',
        leadId: lead.id,
      },
      { status: 201 }
    );
  } catch (err) {
    return handleApiError(err);
  }
}
