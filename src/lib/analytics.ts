import { supabase } from '@/lib/supabase';

export type ProductEventName =
  | 'app_open'
  | 'onboarding_complete'
  | 'first_scan_started'
  | 'first_meal_logged'
  | 'meal_logged'
  | 'reminder_tapped'
  | 'streak_at_risk_shown'
  | 'feed_cta_tapped'
  | 'today_day_selected'
  | 'dragon_named'
  | 'starve_state_viewed'
  | 'fed_celebration_shown'
  | 'paywall_view'
  | 'paywall_purchase'
  | 'paywall_dismiss'
  | 'loot_drop'
  | 'streak_freeze_used'
  | 'duel_created'
  | 'duel_share';

/** Fire-and-forget product analytics (authenticated users only). */
export function trackEvent(
  eventName: ProductEventName,
  props: Record<string, unknown> = {},
): void {
  void (async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return;
      await supabase.from('product_events').insert({
        user_id: userId,
        event_name: eventName,
        props,
      });
    } catch {
      // never block UX on analytics
    }
  })();
}
