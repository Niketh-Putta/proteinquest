/** In-memory local capture URIs so Today/meal can show a thumb before signed URL. */

const byLogId = new Map<string, string>();

export function rememberLocalMealPhoto(logId: string, uri: string): void {
  if (!logId || !uri) return;
  byLogId.set(logId, uri);
}

export function getLocalMealPhoto(logId: string | null | undefined): string | null {
  if (!logId) return null;
  return byLogId.get(logId) ?? null;
}

export function forgetLocalMealPhoto(logId: string): void {
  byLogId.delete(logId);
}
