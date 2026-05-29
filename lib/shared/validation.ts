import { badRequest } from './errors';

// ─────────────────────────────────────────────────────────────────────────────
// String helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses a required string query parameter.
 *
 * @param value     - Raw query parameter value.
 * @param field     - Field name used in error messages.
 * @param maxLength - Optional maximum character length.
 */
export function parseString(
  value: string | null | undefined,
  field: string,
  maxLength?: number,
): string {
  if (value === null || value === undefined || value.trim() === '') {
    throw badRequest(`"${field}" is required.`);
  }
  const trimmed = value.trim();
  if (maxLength !== undefined && trimmed.length > maxLength) {
    throw badRequest(
      `"${field}" must not exceed ${maxLength} characters; received ${trimmed.length}.`,
    );
  }
  return trimmed;
}

/**
 * Parses an optional string query parameter, returning `undefined` when the
 * value is absent or blank.
 *
 * @param value - Raw query parameter value.
 */
export function parseOptionalString(
  value: string | null | undefined,
): string | undefined {
  if (value === null || value === undefined || value.trim() === '') {
    return undefined;
  }
  return value.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Enum helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses a required enum query parameter.
 *
 * @param value      - Raw query parameter value.
 * @param allowed    - Exhaustive list of valid values.
 * @param field      - Field name used in error messages.
 * @param defaultVal - Optional fallback used when the value is absent.
 */
export function parseEnum<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
  field: string,
  defaultVal?: T,
): T {
  if (value === null || value === undefined || value.trim() === '') {
    if (defaultVal !== undefined) {
      return defaultVal;
    }
    throw badRequest(
      `"${field}" is required. Allowed values: ${allowed.join(', ')}.`,
    );
  }
  if (allowed.includes(value as T)) {
    return value as T;
  }
  throw badRequest(
    `Invalid value for "${field}": "${value}". Allowed values: ${allowed.join(', ')}.`,
  );
}

/**
 * Parses an optional enum query parameter.
 *
 * @param value   - Raw query parameter value.
 * @param allowed - Exhaustive list of valid values.
 */
export function parseOptionalEnum<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
): T | undefined {
  if (value === null || value === undefined || value.trim() === '') {
    return undefined;
  }
  if (allowed.includes(value as T)) {
    return value as T;
  }
  throw badRequest(
    `Invalid enum value: "${value}". Allowed values: ${allowed.join(', ')}.`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Boolean helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses a boolean-like query parameter (`"true"` / `"1"` / `"false"` / `"0"`).
 *
 * @param value      - Raw query parameter value.
 * @param defaultVal - Value returned when the parameter is absent (default `false`).
 */
export function parseBoolean(
  value: string | null | undefined,
  defaultVal = false,
): boolean {
  if (value === null || value === undefined || value.trim() === '') {
    return defaultVal;
  }
  const lower = value.toLowerCase().trim();
  if (lower === 'true' || lower === '1') return true;
  if (lower === 'false' || lower === '0') return false;
  throw badRequest(
    `Invalid boolean value: "${value}". Expected "true", "false", "1", or "0".`,
  );
}

/**
 * Parses an optional boolean-like query parameter.
 *
 * @param value - Raw query parameter value.
 */
export function parseOptionalBoolean(
  value: string | null | undefined,
): boolean | undefined {
  if (value === null || value === undefined || value.trim() === '') {
    return undefined;
  }
  return parseBoolean(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// Integer helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses a required positive integer query parameter.
 *
 * @param value - Raw query parameter value.
 * @param field - Field name used in error messages.
 * @param min   - Minimum allowed value (default 1).
 * @param max   - Optional maximum allowed value.
 */
export function parsePositiveInt(
  value: string | null | undefined,
  field: string,
  min = 1,
  max?: number,
): number {
  if (value === null || value === undefined || value.trim() === '') {
    throw badRequest(`"${field}" is required.`);
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || !Number.isInteger(parsed)) {
    throw badRequest(`"${field}" must be an integer; received "${value}".`);
  }
  if (parsed < min) {
    throw badRequest(`"${field}" must be >= ${min}; received ${parsed}.`);
  }
  if (max !== undefined && parsed > max) {
    throw badRequest(`"${field}" must be <= ${max}; received ${parsed}.`);
  }
  return parsed;
}

/**
 * Parses an optional positive integer query parameter.
 *
 * @param value - Raw query parameter value.
 * @param min   - Minimum allowed value (default 0).
 * @param max   - Optional maximum allowed value.
 */
export function parseOptionalPositiveInt(
  value: string | null | undefined,
  min = 0,
  max?: number,
): number | undefined {
  if (value === null || value === undefined || value.trim() === '') {
    return undefined;
  }
  return parsePositiveInt(value, 'value', min, max);
}

// ─────────────────────────────────────────────────────────────────────────────
// Array helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Coerces a query parameter that may appear as a single string or an array of
 * strings into a `string[]`. Comma-separated single strings are split.
 *
 * @param value - Raw query parameter value.
 */
export function parseStringArray(
  value: string | string[] | null | undefined,
): string[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value
      .flatMap((v) => v.split(','))
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
// ISO Alpha-2 country code helpers
// ─────────────────────────────────────────────────────────────────────────────

const ISO_ALPHA2_RE = /^[A-Z]{2}$/;

/**
 * Validates and returns a required ISO 3166-1 alpha-2 country code.
 * The special value `"GLOBAL"` is also accepted.
 *
 * @param value - Raw query parameter value.
 * @param field - Field name used in error messages (default `"code2"`).
 */
export function parseIsoAlpha2(
  value: string | null | undefined,
  field = 'code2',
): string {
  if (value === null || value === undefined || value.trim() === '') {
    throw badRequest(`"${field}" is required. Expected a 2-letter ISO country code or "GLOBAL".`);
  }
  const upper = value.trim().toUpperCase();
  if (upper === 'GLOBAL' || ISO_ALPHA2_RE.test(upper)) {
    return upper;
  }
  throw badRequest(
    `Invalid value for "${field}": "${value}". Expected exactly 2 uppercase letters or "GLOBAL".`,
  );
}

/**
 * Parses an optional ISO 3166-1 alpha-2 country code.
 * The special value `"GLOBAL"` is also accepted.
 *
 * @param value - Raw query parameter value.
 */
export function parseOptionalIsoAlpha2(
  value: string | null | undefined,
): string | undefined {
  if (value === null || value === undefined || value.trim() === '') {
    return undefined;
  }
  return parseIsoAlpha2(value);
}
