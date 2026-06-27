import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { getPaymentProvider } from '@/lib/payments';
import {
  formatBillingDate,
  getSubscriptionBillingDetails,
  type PurchaseHistoryEntry,
  type SubscriptionBillingDetails,
} from '@/lib/subscription-billing';
import { colors, fonts, radius, spacing } from '@/theme';

interface Props {
  userId?: string;
  isPro: boolean;
  onRestored?: () => void;
}

type RowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  busy?: boolean;
  danger?: boolean;
};

function ActionRow({ icon, title, subtitle, onPress, busy, danger }: RowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      android_ripple={{ color: colors.hairlineBright }}
      hitSlop={6}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={[styles.rowIcon, danger && styles.rowIconDanger]}>
        <Ionicons name={icon} size={18} color={danger ? colors.danger : colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, danger && { color: colors.danger }]}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      {busy ? (
        <ActivityIndicator color={colors.textSecondary} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      )}
    </Pressable>
  );
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

function HistoryRow({ entry, isLast }: { entry: PurchaseHistoryEntry; isLast: boolean }) {
  const statusLabel = entry.isActive
    ? entry.willRenew
      ? 'Active · renews'
      : 'Active until'
    : 'Ended';
  const statusDate = entry.isActive ? entry.expiresDate : entry.expiresDate ?? entry.purchaseDate;

  return (
    <View style={[styles.historyRow, isLast && styles.historyRowLast]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.historyPlan}>{entry.planLabel}</Text>
        <Text style={styles.historyMeta}>
          Started {formatBillingDate(entry.purchaseDate)}
          {entry.cancelledAt ? ` · Cancelled ${formatBillingDate(entry.cancelledAt)}` : ''}
        </Text>
      </View>
      <View style={styles.historyRight}>
        <Text style={styles.historyStatus}>{statusLabel}</Text>
        {statusDate ? (
          <Text style={styles.historyDate}>{formatBillingDate(statusDate)}</Text>
        ) : null}
      </View>
    </View>
  );
}

export function BillingSection({ userId, isPro, onRestored }: Props) {
  const [opening, setOpening] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<SubscriptionBillingDetails | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getSubscriptionBillingDetails(userId)
      .then((d) => {
        if (active) setDetails(d);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, isPro]);

  async function openManagement() {
    if (opening) return;
    setOpening(true);
    try {
      const url =
        details?.managementUrl ??
        (Platform.OS === 'ios'
          ? 'https://apps.apple.com/account/subscriptions'
          : 'https://play.google.com/store/account/subscriptions');
      const ok = await Linking.canOpenURL(url);
      if (ok) await Linking.openURL(url);
      else Alert.alert('Could not open', 'Open your store account to manage this subscription.');
    } catch {
      Alert.alert('Something went wrong', 'Please try again from your store account.');
    } finally {
      setOpening(false);
    }
  }

  async function handleRestore() {
    if (restoring) return;
    const provider = getPaymentProvider();
    if (!provider.restore) {
      Alert.alert('Not available', 'Restoring purchases is only available on device.');
      return;
    }
    setRestoring(true);
    try {
      const ok = await provider.restore();
      if (ok) {
        onRestored?.();
        const refreshed = await getSubscriptionBillingDetails(userId);
        setDetails(refreshed);
        Alert.alert('Restored', 'Your Pro subscription is active again.');
      } else {
        Alert.alert('No subscription found', 'We could not find an active Pro subscription.');
      }
    } catch (e: unknown) {
      Alert.alert('Restore failed', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setRestoring(false);
    }
  }

  const accent = details ? statusAccent(details.status) : isPro ? colors.accent : colors.textTertiary;
  const headline = details?.statusHeadline ?? (isPro ? 'ProteinQuest Pro · active' : 'Free plan');
  const showProDetails = details && (details.isPro || details.purchaseHistory.length > 0);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="card" size={18} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Manage billing</Text>
          <Text style={styles.statusLine}>
            <Text style={[styles.statusDot, { color: accent }]}>{'\u25CF'}</Text> {headline}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>Loading subscription details…</Text>
        </View>
      ) : null}

      {details && !loading ? (
        <>
          <View style={[styles.summaryBlock, { borderColor: accent }]}>
            <Text style={styles.summaryDetail}>{details.statusDetail}</Text>

            {showProDetails ? (
              <View style={styles.detailsBlock}>
                {details.planLabel !== 'Free' ? (
                  <DetailRow label="Plan" value={details.planLabel} />
                ) : null}
                {details.memberSince ? (
                  <DetailRow label="Member since" value={formatBillingDate(details.memberSince)} />
                ) : null}
                {details.isPro && details.accessUntil ? (
                  <DetailRow
                    label={details.status === 'cancelled' ? 'Pro access until' : 'Current period ends'}
                    value={formatBillingDate(details.accessUntil)}
                    highlight={details.status === 'cancelled'}
                  />
                ) : null}
                {details.nextBillingDate ? (
                  <DetailRow label="Next charge" value={formatBillingDate(details.nextBillingDate)} />
                ) : null}
                {details.cancelledAt ? (
                  <DetailRow label="Cancelled on" value={formatBillingDate(details.cancelledAt)} />
                ) : null}
                {details.billingIssueAt ? (
                  <DetailRow
                    label="Billing issue detected"
                    value={formatBillingDate(details.billingIssueAt)}
                    highlight
                  />
                ) : null}
                <DetailRow label="Managed via" value={details.storeLabel} />
              </View>
            ) : null}

            {details.status === 'cancelled' ? (
              <View style={styles.callout}>
                <Ionicons name="information-circle-outline" size={16} color={colors.warning} />
                <Text style={styles.calloutText}>
                  Cancelling stops future charges only. You won&apos;t lose Pro early — unlimited
                  scans continue until the date above.
                </Text>
              </View>
            ) : null}
          </View>

          {details.purchaseHistory.length > 0 ? (
            <View style={styles.block}>
              <Text style={styles.blockLabel}>PAYMENT HISTORY</Text>
              <View style={styles.historyCard}>
                {details.purchaseHistory.map((entry, index) => (
                  <HistoryRow
                    key={`${entry.productId}-${entry.purchaseDate.toISOString()}`}
                    entry={entry}
                    isLast={index === details.purchaseHistory.length - 1}
                  />
                ))}
              </View>
              <Text style={styles.historyNote}>
                Receipt amounts and invoices are in your {details.storeLabel} purchase history.
              </Text>
            </View>
          ) : null}

          <View style={styles.block}>
            <Text style={styles.blockLabel}>ACTIONS</Text>
            <ActionRow
              icon="card-outline"
              title="Update payment method"
              subtitle={`Change card or payment in ${details.storeLabel}`}
              onPress={openManagement}
              busy={opening}
            />
            <ActionRow
              icon="receipt-outline"
              title="View receipts & invoices"
              subtitle="Full payment history with amounts"
              onPress={openManagement}
              busy={opening}
            />
            <ActionRow
              icon="refresh-outline"
              title="Restore purchases"
              subtitle="Reactivate Pro on this device"
              onPress={handleRestore}
              busy={restoring}
            />
            <ActionRow
              icon="close-circle-outline"
              title={details.status === 'cancelled' ? 'Manage cancellation' : 'Cancel subscription'}
              subtitle={
                details.status === 'cancelled'
                  ? 'Already cancelled — change or resubscribe in store'
                  : 'Turn off auto-renew (keep Pro until period ends)'
              }
              onPress={openManagement}
              busy={opening}
              danger={details.status !== 'cancelled'}
            />
          </View>

          <Text style={styles.note}>
            Payment methods, receipts, and cancellations are handled by your {details.storeLabel}{' '}
            account. We&apos;ll take you straight there.
          </Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineBright,
    borderRadius: 10,
    padding: spacing.md,
    gap: spacing.md,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.accentSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: fonts.displayMedium,
    fontSize: 15,
    color: colors.text,
  },
  statusLine: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statusDot: { fontSize: 10 },
  loadingBox: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  loadingText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
  },
  summaryBlock: {
    backgroundColor: colors.bgRaised,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  summaryDetail: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
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
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  block: { gap: spacing.sm },
  blockLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.textTertiary,
  },
  historyCard: {
    backgroundColor: colors.bgRaised,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    overflow: 'hidden',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  historyRowLast: {
    borderBottomWidth: 0,
  },
  historyPlan: {
    fontFamily: fonts.displayMedium,
    fontSize: 14,
    color: colors.text,
  },
  historyMeta: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: 2,
    lineHeight: 15,
  },
  historyRight: { alignItems: 'flex-end' },
  historyStatus: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },
  historyDate: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.text,
    marginTop: 2,
  },
  historyNote: {
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textTertiary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.bgRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    overflow: 'hidden',
  },
  rowPressed: { opacity: 0.85 },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.accentSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconDanger: { backgroundColor: 'rgba(255, 107, 122, 0.12)' },
  rowTitle: {
    fontFamily: fonts.displayMedium,
    fontSize: 15,
    color: colors.text,
  },
  rowSubtitle: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  note: {
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textTertiary,
  },
});
