/** Google Play Real-time Developer Notifications. Native Play types, not Apple's. */

export type PlayRtdnMessage = {
  messageId: string | null;
  purchaseToken: string | null;
  subscriptionId: string | null;
  packageName: string | null;
  isTest: boolean;
  eventTime: string | null;
  notificationType: number | null;
};

function decodeJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function decodePubSubData(data?: string | null): Record<string, unknown> | null {
  if (!data) return null;
  try {
    const text = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
    return decodeJson(text);
  } catch {
    return decodeJson(data);
  }
}

export function parsePlayRtdn(
  body: { message?: { messageId?: string; data?: string } } | null,
): PlayRtdnMessage {
  const messageId = body?.message?.messageId ?? null;
  const decoded = decodePubSubData(body?.message?.data);
  const sub = (decoded?.subscriptionNotification ?? null) as Record<string, unknown> | null;
  const oneTime = (decoded?.oneTimeProductNotification ?? null) as Record<string, unknown> | null;
  const purchaseToken = String(sub?.purchaseToken ?? oneTime?.purchaseToken ?? "") || null;
  return {
    messageId,
    purchaseToken,
    subscriptionId: String(sub?.subscriptionId ?? oneTime?.sku ?? "") || null,
    packageName: String(decoded?.packageName ?? "") || null,
    isTest: Boolean(decoded?.testNotification),
    eventTime: decoded?.eventTimeMillis
      ? new Date(Number(decoded.eventTimeMillis)).toISOString()
      : null,
    notificationType: Number.isFinite(Number(sub?.notificationType))
      ? Number(sub?.notificationType)
      : null,
  };
}

export function rtdnReplayIds(parsed: PlayRtdnMessage): string[] {
  const ids = [parsed.messageId, parsed.purchaseToken].filter(Boolean) as string[];
  return [...new Set(ids)];
}
