import { Ionicons } from '@expo/vector-icons';
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

import { getBillingManagementUrl, getPaymentProvider } from '@/lib/payments';
import { colors, fonts, pressableWeb, radius, spacing } from '@/theme';

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

export function BillingSheet({ visible, isPro, onClose, onRestored }: Props) {
  const [opening, setOpening] = useState(false);
  const [restoring, setRestoring] = useState(false);

  async function openManagement() {
    if (opening) return;
    setOpening(true);
    try {
      const url = await getBillingManagementUrl();
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

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View entering={FadeIn.duration(180)} style={styles.backdropFill} />
      </Pressable>
      <SafeAreaView style={styles.sheetWrap} edges={['bottom']} pointerEvents="box-none">
        <Animated.View entering={FadeInUp.duration(240)} style={styles.sheet}>
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
            <ActionRow
              icon="card-outline"
              title="Update payment method"
              subtitle="Change the card or bank account on file"
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
              title="Cancel subscription"
              subtitle="Turn off auto-renew and stop billing"
              onPress={openManagement}
              busy={opening}
              danger
            />

            <Text style={styles.note}>
              Payment methods, billing history, and cancellations are securely handled by your{' '}
              {Platform.OS === 'ios' ? 'Apple ID' : 'Google Play'} account. We&apos;ll take you
              straight there.
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
    maxWidth: 480,
    alignSelf: 'center',
    backgroundColor: colors.bgRaised,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineBright,
    paddingHorizontal: spacing.lg,
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
