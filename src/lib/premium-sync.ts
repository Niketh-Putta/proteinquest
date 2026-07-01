export interface PremiumSyncResult {
  /** Whether the stored premium flag differs from the live entitlement. */
  changed: boolean;
  is_premium: boolean;
  /** Upgrade → dismiss the paywall. Downgrade → re-enable paywalls. */
  paywall_dismissed: boolean;
}

/**
 * Reconcile the stored premium flag with the live store entitlement.
 *
 * - Upgrade (free → pro): mark premium and auto-dismiss the paywall.
 * - Downgrade (pro → free, e.g. a cancelled/expired subscription): clear
 *   premium AND clear `paywall_dismissed` so former subscribers are gated by
 *   the paywall exactly like everyone else.
 * - No change: caller should not write.
 */
export function resolvePremiumSync(
  currentlyPro: boolean,
  entitledNow: boolean,
): PremiumSyncResult {
  return {
    changed: currentlyPro !== entitledNow,
    is_premium: entitledNow,
    paywall_dismissed: entitledNow,
  };
}
