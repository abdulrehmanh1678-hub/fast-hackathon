import { NextRequest, NextResponse } from 'next/server';
import { handleGoogleOAuthCallback } from '@/server/integrations/google-calendar';
import { handleApiError, AppError } from '@/shared/errors';

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get('code');
    const state = req.nextUrl.searchParams.get('state');

    if (!code || !state) {
      throw new AppError('MISSING_PARAMS', 'Missing code or state parameter in Google callback', 400);
    }

    const result = await handleGoogleOAuthCallback(code, state);

    // Redirect to frontend integrations page with success flag
    const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
    return NextResponse.redirect(`${baseUrl}/settings/integrations?google_connected=true`);
  } catch (err) {
    return handleApiError(err);
  }
}
