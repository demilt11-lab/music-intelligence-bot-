import { NextResponse } from 'next/server';

export { handleApiError } from './errors';

/**
 * JSON replacer that converts bigint values to their string representation so
 * that `JSON.stringify` does not throw on BigInt fields returned from Prisma.
 */
export function bigintReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

/**
 * Wraps `data` in a successful JSON response.
 *
 * BigInt values anywhere in `data` are automatically serialised to strings via
 * {@link bigintReplacer} so that the response never throws a serialisation
 * error.
 *
 * @param data   - The payload to send.
 * @param status - HTTP status code (default 200).
 */
export function successResponse<T>(data: T, status = 200): NextResponse {
  // NextResponse.json uses JSON.stringify internally; we need to go through a
  // manual stringify / parse cycle to apply the replacer before handing the
  // value off.
  const serialised = JSON.parse(JSON.stringify(data, bigintReplacer)) as T;
  return NextResponse.json(serialised, { status });
}

/**
 * Returns an error JSON response.
 *
 * @param message - Human-readable error description.
 * @param status  - HTTP status code (default 400).
 */
export function errorResponse(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
