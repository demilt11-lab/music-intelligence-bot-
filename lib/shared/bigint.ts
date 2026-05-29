/**
 * Recursively walks `obj` and converts every `bigint` field to a `string`.
 *
 * The return type is intentionally kept as `T` because callers typically want
 * to preserve the shape of the original type; individual bigint leaves simply
 * become strings at runtime.
 *
 * @param obj - Any serialisable value.
 */
export function serializeBigInt<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'bigint') {
    return obj.toString() as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(serializeBigInt) as unknown as T;
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = serializeBigInt(value);
    }
    return result as T;
  }

  return obj;
}

/**
 * Converts a bigint, number, `null`, or `undefined` to its string
 * representation, returning `null` for nullish inputs.
 *
 * @param value - The value to convert.
 */
export function toBigIntString(
  value: bigint | number | null | undefined,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return value.toString();
}

/**
 * Safely converts a bigint or number to a JavaScript `number`.
 *
 * Note: Very large bigint values may lose precision when converted to a
 * floating-point number. Use {@link toBigIntString} when precision matters.
 *
 * @param value - The value to convert.
 */
export function safeNumber(
  value: bigint | number | null | undefined,
): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  return value;
}
