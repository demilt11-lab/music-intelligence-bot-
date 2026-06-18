import { NextResponse } from 'next/server';

/**
 * Structured API error with an HTTP status code and a machine-readable code.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }
}

/**
 * Creates a 404 Not Found ApiError.
 * @param msg - Human-readable description of what was not found.
 */
export function notFound(msg: string): ApiError {
  return new ApiError(msg, 404, 'NOT_FOUND');
}

/**
 * Creates a 400 Bad Request ApiError.
 * @param msg - Human-readable description of the bad input.
 */
export function badRequest(msg: string): ApiError {
  return new ApiError(msg, 400, 'BAD_REQUEST');
}

/**
 * Creates a 500 Internal Server Error ApiError.
 * @param msg - Human-readable description of the server-side failure.
 */
export function internalError(msg: string): ApiError {
  return new ApiError(msg, 500, 'INTERNAL_ERROR');
}

/**
 * Converts any thrown value into a JSON NextResponse with the appropriate
 * HTTP status code. ApiError instances are surfaced with their own status;
 * all other errors become 500 responses.
 *
 * @param err - The caught value (may be an Error, ApiError, or anything else).
 */
export function handleApiError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: err.statusCode },
    );
  }

  console.error('[handleApiError] Unhandled error:', err);

  return NextResponse.json(
    { error: 'Internal server error', code: 'INTERNAL_ERROR' },
    { status: 500 },
  );
}
