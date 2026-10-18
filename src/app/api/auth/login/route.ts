import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db';
import { LoginSchema } from '@/shared/schemas';
import {
  verifyPassword,
  createSession,
  checkLoginRateLimit,
  recordFailedLogin,
  recordSuccessfulLogin,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from '@/server/auth/session';
import { handleApiError, AppError } from '@/shared/errors';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = LoginSchema.parse(body);

    const email = input.email.toLowerCase();
    const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown-ip';
    const rateLimitKey = `${clientIp}:${email}`;

    // Login rate limiting protection [Q1]
    checkLoginRateLimit(rateLimitKey);

    const user = await prisma.user.findUnique({
      where: { email },
      include: { workspace: true, permissions: true },
    });

    if (!user) {
      recordFailedLogin(rateLimitKey);
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    const isValid = await verifyPassword(user.passwordHash, input.password);
    if (!isValid) {
      recordFailedLogin(rateLimitKey);
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    // Reset rate limiter on successful login
    recordSuccessfulLogin(rateLimitKey);

    // Create session token and set httpOnly cookie (F1.1, Q1)
    const sessionToken = await createSession(user.id, user.workspaceId);

    const response = NextResponse.json({
      success: true,
      workspace: { id: user.workspace.id, name: user.workspace.name, slug: user.workspace.slug },
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions: user.permissions.map((p) => p.action),
      },
    });

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
