import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SkeletonCards } from '@/components/LoadingSkeleton';
import {
  formatBillingDate,
  getSubscriptionBillingDetails,
  type SubscriptionBillingDetails,
} from '@/lib/subscription-billing';
import { colors, fonts, radius, spacing } from '@/theme';

interface Props {
  userId?: string;
  isPro: boolean;
}

function DetailRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, highlight && styles.detailValueHighlight]}>{value}</Text>
    </View>
  );
}

function statusAccent(status: SubscriptionBillingDetails['status']) {
  switch (status) {
    case 'active':
      return colors.accent;
    case 'cancelled':
      return colors.warning;
    case 'billing_issue':
      return colors.danger;
    case 'expired':
      return colors.textTertiary;
    default:
      return colors.textSecondary;
  }
}

export function SubscriptionBillingInfo({ userId, isPro }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [details, setDetails] = useState<SubscriptionBillingDetails | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const d = await getSubscriptionBillingDetails(userId);
        if (!active) return;
        setDetails(d);
        setError(false);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [userId, isPro]);

  if (loading) {
    return (
      <View style={styles.box} accessibilityLabel="Loading subscription details">
        <SkeletonCards count={1} />
      </View>
    );
  }

  if (error || !details) {
    return (
      <View style={styles.box}>
        <Text style={styles.errorText}>Could not load subscription details. Try again later.</Text>
      </View>
    );
  }

  const accent = statusAccent(details.status);
  const showDetails =
    details.isPro || details.purchaseHistory.length > 0 || details.status === 'expired';

  if (!showDetails) {
    return (
      <View style={styles.box}>
        <Text style={styles.freeText}>No active subscription. Upgrade to Pro for unlimited scans.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, { borderColor: accent }]}>
      <View style={styles.statusRow}>
        <Text style={[styles.statusDot, { color: accent }]}>{'\u25CF'}</Text>
        <Text style={styles.statusHeadline}>{details.statusHeadline}</Text>
      </View>
      <Text style={styles.statusDetail}>{details.statusDetail}</Text>

      <View style={styles.detailsBlock}>
        {details.planLabel !== 'Free' ? (
          <DetailRow label="Plan" value={`ProteinQuest Pro · ${details.planLabel}`} />
        ) : null}
        {details.lastPaymentDate ? (
          <DetailRow label="Last payment" value={formatBillingDate(details.lastPaymentDate)} />
        ) : null}
        {details.nextBillingDate ? (
          <DetailRow label="Next payment" value={formatBillingDate(details.nextBillingDate)} />
        ) : null}
        {details.status === 'cancelled' && details.accessUntil ? (
          <DetailRow
            label="Plan cancels"
            value={formatBillingDate(details.accessUntil)}
            highlight
          />
        ) : null}
        {details.cancelledAt && details.status === 'cancelled' ? (
          <DetailRow label="Cancelled on" value={formatBillingDate(details.cancelledAt)} />
        ) : null}
        {details.billingIssueAt ? (
          <DetailRow
            label="Billing issue"
            value={formatBillingDate(details.billingIssueAt)}
            highlight
          />
        ) : null}
      </View>

      {details.status === 'cancelled' ? (
        <View style={styles.callout}>
          <Ionicons name="information-circle-outline" size={14} color={colors.warning} />
          <Text style={styles.calloutText}>
            Cancelling stops future charges only. Pro access continues until the date above.
          </Text>
        </View>
      ) : null}

      <Text style={styles.storeNote}>Managed via {details.storeLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.danger,
    textAlign: 'center',
  },
  freeText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 17,
  },
  card: {
    backgroundColor: colors.bgRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: { fontSize: 10 },
  statusHeadline: {
    fontFamily: fonts.displayMedium,
    fontSize: 13,
    color: colors.text,
  },
  statusDetail: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  detailsBlock: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  detailLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
  },
  detailValue: {
    fontFamily: fonts.displayMedium,
    fontSize: 12,
    color: colors.text,
    textAlign: 'right',
    flex: 1,
  },
  detailValueHighlight: {
    color: colors.warning,
  },
  callout: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255, 180, 84, 0.08)',
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  calloutText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textSecondary,
  },
  storeNote: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textTertiary,
  },
});
