const PROVIDERS: Record<string, string> = {
  app_store_connect: "Apple",
  app_store_server: "Apple notifications",
  google_play: "Google Play",
  google_rtdn: "Play live events",
  revenuecat: "Subscriptions",
  fx: "Exchange rates",
  supabase: "Database",
  website: "Website",
  app_events: "App events",
  openai: "AI costs",
  ads_apple_search: "Apple Search Ads",
  ads_meta: "Meta ads",
  ads_tiktok: "TikTok ads",
  ads_google: "Google ads",
  apple_membership_invoice: "Apple fees",
  google_registration_invoice: "Play fees",
  vercel: "Hosting",
};

const STATUSES: Record<string, string> = {
  connected: "Live",
  verified: "Verified",
  requires_owner_access: "Needs setup",
  not_connected: "Off",
  error: "Error",
};

export function providerLabel(provider: string) {
  return PROVIDERS[provider] ?? provider.replaceAll("_", " ");
}

export function statusLabel(status: string) {
  return STATUSES[status] ?? status.replaceAll("_", " ");
}

export function metricHint(status: string) {
  if (status === "ok") return "";
  if (status === "not_connected") return "Waiting on a live feed";
  if (status === "no_data") return "Nothing in this period yet";
  if (status === "unavailable") return "Not set up";
  return "";
}
