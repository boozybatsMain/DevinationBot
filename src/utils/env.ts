/**
 * Requires an environment variable to be set. Throws at module load time if missing.
 */
export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

/**
 * Returns an environment variable or a fallback value.
 */
export function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}
