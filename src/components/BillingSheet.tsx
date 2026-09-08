import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLayout } from '@/lib/layout';
import { getBillingManagementUrl, getPaymentProvider } from '@/lib/payments';
import { colors, fonts, layout, pressableWeb, radius, spacing } from '@/theme';

const IS_WEB = Platform.OS === 'web';

interface Props {
  visible: boolean;
  isPro: boolean;
  onClose: () => void;
  /** Called after a successful restore so the caller can refresh premium state. */
  onRestored?: () => void;
}

type RowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  busy?: boolean;
  danger?: boolean;
  /** External store link vs in-app action */
  external?: boolean;
};

function ActionRow({ icon, title, subtitle, onPress, busy, danger, external }: RowProps) {
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
        <Ionicons
          name={external ? 'open-outline' : 'chevron-forward'}
          size={18}
          color={colors.textTertiary}
        />
      )}
    </Pressable>
  );
}

const STORE_NAME =
  Platform.OS === 'ios' ? 'App Store' : Platform.OS === 'android' ? 'Google Play' : 'App Store';

export function BillingSheet({ visible, isPro, onClose, onRestored }: Props) {
  const { horizontalPad } = useLayout();
  const [opening, setOpening] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const canRestore = !IS_WEB && !!getPaymentProvider().restore;

  async function openStoreSubscriptions() {
    if (opening || IS_WEB) return;
    setOpening(true);
    try {
      const url = await getBillingManagementUrl();
      const ok = await Linking.canOpenURL(url);
      if (ok) await Linking.openURL(url);
      else {
        Alert.alert(
          `Open ${STORE_NAME}`,
          Platform.OS === 'android'
            ? 'Go to Play Store → Profile → Payments & subscriptions → Subscriptions, then choose ProteinQuest.'
            : 'Go to Settings → Apple ID → Subscriptions, then choose ProteinQuest.',
        );
      }
    } catch {
      Alert.alert('Something went wrong', `Open ${STORE_NAME} and manage ProteinQuest from Subscriptions.`);
    } finally {
      setOpening(false);
    }
  }

  function confirmOpenStore(purpose: 'manage' | 'cancel') {
    const title =
      purpose === 'cancel' ? `Cancel in ${STORE_NAME}` : `Manage in ${STORE_NAME}`;
    const message =
      purpose === 'cancel'
        ? Platform.OS === 'android'
          ? 'ProteinQuest cannot cancel Play subscriptions in-app. Google Play will open so you can turn off auto-renew there. You keep Pro until the end of the paid period.'
          : 'ProteinQuest cannot cancel App Store subscriptions in-app. The App Store will open so you can turn off auto-renew there. You keep Pro until the end of the paid period.'
        : Platform.OS === 'android'
          ? 'Payment method, plan changes, and cancellation are handled by Google Play, not inside ProteinQuest.'
          : 'Payment method, plan changes, and cancellation are handled by the App Store, not inside ProteinQuest.';

    Alert.alert(title, message, [
      { text: 'Not now', style: 'cancel' },
      {
        text: `Open ${STORE_NAME}`,
        style: purpose === 'cancel' ? 'destructive' : 'default',
        onPress: () => {
          void openStoreSubscriptions();
        },
      },
    ]);
  }

  function openPaywallPlans() {
    onClose();
    router.push('/paywall');
  }

  async function handleRestore() {
    if (restoring) return;
    if (IS_WEB || !canRestore) {
      Alert.alert(
        'Restore on your phone',
        'Open ProteinQuest on iOS or Android, then use Restore purchases there.',
      );
      return;
    }
    const provider = getPaymentProvider();
    if (!provider.restore) {
      Alert.alert('Not available', 'Restoring purchases is only available on this device.');
      return;
    }
    setRestoring(true);
    try {
      const ok = await provider.restore();
      if (ok) {
        onRestored?.();
        Alert.alert('Restored', 'Your Pro subscription is active on this device.');
      } else {
        Alert.alert(
          'No subscription found',
          `We could not find an active Pro purchase for this ${STORE_NAME} account.`,
        );
      }
    } catch (e: unknown) {
      Alert.alert('Restore failed', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setRestoring(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View entering={FadeIn.duration(180)} style={styles.backdropFill} />
      </Pressable>
      <SafeAreaView style={styles.sheetWrap} edges={['bottom']} pointerEvents="box-none">
        <Animated.View
          entering={FadeInUp.duration(240)}
          style={[styles.sheet, { paddingHorizontal: horizontalPad }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Manage billing</Text>
              <Text style={styles.statusLine}>
                <Text style={[styles.statusDot, isPro ? styles.dotActive : styles.dotInactive]}>
                  {'\u25CF'}
                </Text>{' '}
                {isPro ? 'ProteinQuest Pro · active' : 'Free plan'}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}>
            {isPro && !IS_WEB ? (
              <>
                <ActionRow
                  icon="open-outline"
                  title={`Manage on ${STORE_NAME}`}
                  subtitle="Update payment method, change plan, or view invoices"
                  onPress={() => confirmOpenStore('manage')}
                  busy={opening}
                  external
                />
                <ActionRow
                  icon="close-circle-outline"
                  title={`Cancel on ${STORE_NAME}`}
                  subtitle="Opens the store. Turn off auto-renew there (not in this app)"
                  onPress={() => confirmOpenStore('cancel')}
                  busy={opening}
                  danger
                  external
                />
              </>
            ) : null}

            {!isPro ? (
              <ActionRow
                icon="star-outline"
                title="View Pro plans"
                subtitle={
                  IS_WEB
                    ? 'See monthly and annual Pro plans, then get the app to subscribe'
                    : 'Open the paywall for monthly and annual Pro'
                }
                onPress={openPaywallPlans}
              />
            ) : null}

            <ActionRow
              icon="refresh-outline"
              title="Restore purchases"
              subtitle={
                IS_WEB
                  ? 'Restore works in the iOS or Android app'
                  : `Re-check this ${STORE_NAME} account for an active Pro plan`
              }
              onPress={() => {
                void handleRestore();
              }}
              busy={restoring}
            />

            <Text style={styles.note}>
              {IS_WEB
                ? 'Subscriptions are purchased in the ProteinQuest iOS or Android app through Apple or Google. Use Restore there if you already subscribed.'
                : Platform.OS === 'android'
                  ? 'Google Play owns subscription billing. Cancel and payment changes only take effect in Play Store → Subscriptions. Restore only refreshes Pro status in the app.'
                  : 'Apple owns subscription billing. Cancel and payment changes only take effect in App Store → Subscriptions. Restore only refreshes Pro status in the app.'}
            </Text>
          </ScrollView>
        </Animated.View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  backdropFill: { flex: 1, backgroundColor: 'rgba(6, 6, 9, 0.7)' },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    ...pressableWeb,
    width: '100%',
    maxWidth: layout.sheetMaxWidth,
    alignSelf: 'center',
    backgroundColor: colors.bgRaised,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineBright,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    maxHeight: '85%',
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.hairlineBright,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fonts.displayHeavy,
    fontSize: 22,
    color: colors.text,
    letterSpacing: -0.5,
  },
  statusLine: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
  },
  statusDot: { fontSize: 10 },
  dotActive: { color: colors.accent },
  dotInactive: { color: colors.textTertiary },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flexGrow: 0 },
  scrollContent: { gap: spacing.sm, paddingBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
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
    marginTop: spacing.sm,
  },
});
