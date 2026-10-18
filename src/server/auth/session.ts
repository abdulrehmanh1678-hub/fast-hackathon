import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import crypto from 'crypto';
import * as argon2 from '@node-rs/argon2';
import { prisma } from '@/server/db';
import { AppError } from '@/shared/errors';
import { SessionContext } from '@/shared/types';

export const SESSION_COOKIE_NAME = 'fast_crm_session';
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

// -------------------------------------------------------------
// LOGIN RATE LIMITER (In-memory token bucket / attempt tracker) [Q1]
// -------------------------------------------------------------
interface AttemptRecord {
  count: number;
  resetAt: number;
}

const loginAttempts = new Map<string, AttemptRecord>();
const MAX_LOGIN_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export function checkLoginRateLimit(identifier: string): void {
  const now = Date.now();
  const record = loginAttempts.get(identifier);

  if (record) {
    if (now > record.resetAt) {
      loginAttempts.delete(identifier);
    } else if (record.count >= MAX_LOGIN_ATTEMPTS) {
      const waitMinutes = Math.ceil((record.resetAt - now) / 60000);
      throw new AppError(
        'TOO_MANY_ATTEMPTS',
        `Too many failed login attempts. Please try again in ${waitMinutes} minutes.`,
        429
      );
    }
  }
}

export function recordFailedLogin(identifier: string): void {
  const now = Date.now();
  const record = loginAttempts.get(identifier);

  if (!record || now > record.resetAt) {
    loginAttempts.set(identifier, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
  } else {
    record.count += 1;
  }
}

export function recordSuccessfulLogin(identifier: string): void {
  loginAttempts.delete(identifier);
}

// -------------------------------------------------------------
// ARGON2 PASSWORD HASHING [Q1]
// -------------------------------------------------------------
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

// -------------------------------------------------------------
// SESSIONS & COOKIES [F1.1, Q1]
// -------------------------------------------------------------
export async function createSession(userId: string, workspaceId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await prisma.session.create({
    data: {
      userId,
      workspaceId,
      token,
      expiresAt,
    },
  });

  return token;
}

export async function destroySession(token: string): Promise<void> {
  try {
    await prisma.session.delete({
      where: { token },
    });
  } catch {
    // Already deleted or invalid
  }
}

export async function getSessionContext(req?: NextRequest): Promise<SessionContext | null> {
  let token: string | undefined;

  if (req) {
    token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    // Also support Authorization: Bearer <token> for direct API testing / integrations
    if (!token) {
      const authHeader = req.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }
  } else {
    try {
      const cookieStore = cookies();
      token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    } catch {
      // Cookies not available outside request context
    }
  }

  if (!token) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: {
        include: {
          permissions: true,
        },
      },
    },
  });

  if (!session) {
    return null;
  }

  // Check expiration
  if (session.expiresAt < new Date()) {
    await destroySession(token);
    return null;
  }

  const permissions = session.user.permissions.map((p) => p.action);

  return {
    userId: session.user.id,
    workspaceId: session.workspaceId,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    permissions,
  };
}

// -------------------------------------------------------------
// CSRF VALIDATION [Q3]
// -------------------------------------------------------------
export function validateCsrf(req: NextRequest): void {
  // Safe HTTP methods don't require CSRF checks
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return;
  }

  // Webhook and public intake routes bypass CSRF check (they use signature checks or public forms)
  const pathname = req.nextUrl.pathname;
  if (
    pathname.startsWith('/api/integrations/twilio/webhook') ||
    pathname.startsWith('/api/integrations/twilio/status') ||
    pathname.startsWith('/api/integrations/whatsapp/webhook') ||
    pathname.startsWith('/api/integrations/safepay/webhook') ||
    pathname.startsWith('/api/leads/public')
  ) {
    return;
  }

  // Check Origin or Referer header for state modifying requests
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const host = req.headers.get('host');

  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        throw new AppError('CSRF_INVALID', 'Cross-origin request rejected', 403);
      }
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError('CSRF_INVALID', 'Invalid request origin', 403);
    }
  }
}

