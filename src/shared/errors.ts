import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string[]>;
  };
}

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly fields?: Record<string, string[]>;

  constructor(code: string, message: string, statusCode: number = 400, fields?: Record<string, string[]>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.fields = fields;
  }
}

export function createErrorResponse(
  code: string,
  message: string,
  statusCode: number = 400,
  fields?: Record<string, string[]>
): NextResponse<ApiErrorResponse> {
  const body: ApiErrorResponse = {
    error: {
      code,
      message,
      ...(fields ? { fields } : {}),
    },
  };
  return NextResponse.json(body, { status: statusCode });
}

export function handleApiError(err: unknown): NextResponse<ApiErrorResponse> {
  if (err instanceof AppError) {
    return createErrorResponse(err.code, err.message, err.statusCode, err.fields);
  }

  if (err instanceof ZodError) {
    const fields: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const fieldPath = issue.path.join('.') || 'root';
      if (!fields[fieldPath]) {
        fields[fieldPath] = [];
      }
      fields[fieldPath].push(issue.message);
    }
    return createErrorResponse('VALIDATION_ERROR', 'Validation failed for one or more fields', 422, fields);
  }

  console.error('Unhandled server error:', err);
  return createErrorResponse('INTERNAL_SERVER_ERROR', 'An unexpected internal server error occurred', 500);
}
