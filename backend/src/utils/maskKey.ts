/**
 * Returns a partially-masked version of a Redis key to avoid
 * disclosing sensitive information in audit logs.
 *
 * Examples:
 *   "a"           → "a***"
 *   "user"        → "u***"
 *   "session:abc" → "ses***"
 */
export function maskKey(key: string): string {
  if (!key) return key;
  const visibleLength = Math.min(3, Math.max(1, Math.ceil(key.length / 5)));
  return key.slice(0, visibleLength) + '***';
}
