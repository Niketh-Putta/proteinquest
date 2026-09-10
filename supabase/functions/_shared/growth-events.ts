export const ANALYTICS_SCHEMA_VERSION = 1;
export const ANALYTICS_START_DATE = "2026-09-10";

export const APP_EVENT_NAMES = [
  "first_open",
  "onboarding_started",
  "onboarding_step_viewed",
  "onboarding_step_completed",
  "onboarding_completed",
  "account_created",
  "sign_in_succeeded",
  "meal_scan_started",
  "meal_scan_succeeded",
  "meal_scan_failed",
  "meal_logged",
  "paywall_viewed",
  "purchase_started",
  "app_session_started",
  "landing_viewed",
  "store_link_clicked",
] as const;

export type AppEventName = (typeof APP_EVENT_NAMES)[number];

export const FORBIDDEN_PROP_KEYS = [
  "email",
  "password",
  "age",
  "weight",
  "weight_kg",
  "birthday",
  "height",
  "height_cm",
  "image",
  "photo",
  "image_base64",
  "meal_image",
  "health",
  "token",
  "access_token",
  "refresh_token",
];

export function isAllowedEventName(name: string): name is AppEventName {
  return (APP_EVENT_NAMES as readonly string[]).includes(name);
}

export function stripForbiddenProps(
  props: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!props) return out;
  for (const [key, value] of Object.entries(props)) {
    const lower = key.toLowerCase();
    if (FORBIDDEN_PROP_KEYS.some((blocked) => lower.includes(blocked))) continue;
    if (typeof value === "string" && value.includes("@")) continue;
    out[key] = value;
  }
  return out;
}
