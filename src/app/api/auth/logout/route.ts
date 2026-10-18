import { NextRequest, NextResponse } from 'next/server';
import { destroySession, SESSION_COOKIE_NAME } from '@/server/auth/session';
import { handleApiError } from '@/shared/errors';

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (token) {
      await destroySession(token);
    }

    const response = NextResponse.json({ success: true, message: 'Logged out successfully' });

    response.cookies.set(SESSION_COOKIE_NAME, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });

    return response;
  } catch (err) {
    return handleApiError(err);
  }
}
