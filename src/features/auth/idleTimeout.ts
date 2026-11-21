export const DEFAULT_IDLE_TIMEOUT_MINUTES = 15;

/**
 * Determines whether the app has been inactive longer than the configured
 * hospital idle timeout (MP-AUTH-005).
 */
export function isIdleExpired(
  lastActiveAtMs: number | null,
  nowMs: number,
  timeoutMinutes: number = DEFAULT_IDLE_TIMEOUT_MINUTES,
): boolean {
  if (lastActiveAtMs === null || !Number.isFinite(lastActiveAtMs)) {
    return false;
  }
  const effectiveMinutes =
    Number.isFinite(timeoutMinutes) && timeoutMinutes > 0
      ? timeoutMinutes
      : DEFAULT_IDLE_TIMEOUT_MINUTES;
  return nowMs - lastActiveAtMs >= effectiveMinutes * 60 * 1000;
}
