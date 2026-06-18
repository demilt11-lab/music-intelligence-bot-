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

