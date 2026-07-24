/**
 * In-memory local meal photo URIs so Today thumbs can paint immediately after
 * Log it, before storage upload / signed URL round-trips finish.
 */

const byLogId = new Map<string, string>();

export function rememberLocalMealPhoto(logId: string, uri: string): void {
  if (!logId || !uri) return;
  byLogId.set(logId, uri);
}

export function peekLocalMealPhoto(logId: string | null | undefined): string | null {
  if (!logId) return null;
  return byLogId.get(logId) ?? null;
}

/** Alias used by meal detail screen. */
export const getLocalMealPhoto = peekLocalMealPhoto;

export function clearLocalMealPhoto(logId: string): void {
  byLogId.delete(logId);
}

/** Alias for callers that used the older name. */
export const forgetLocalMealPhoto = clearLocalMealPhoto;
