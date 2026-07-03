import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import {
  FREE_DAILY_SCANS,
  getNativePaymentProvider,
  getPaymentProvider,
  type PaymentPlan,
  type PaymentProvider,
} from '@/lib/payments';
import { SITE_URL } from '@/lib/site';
import { useSession } from '@/lib/session';
import { colors, fonts, radius, spacing } from '@/theme';

const PERKS = [
  { icon: 'infinite' as const, text: 'Unlimited AI scans every day' },
  { icon: 'flash' as const, text: 'Priority analysis speed' },
  { icon: 'camera' as const, text: 'Never hit the daily scan limit' },
];

const PRIVACY_URL = `${SITE_URL}/privacy`;
const TERMS_URL =
  Platform.OS === 'ios'
    ? 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/'
    : `${SITE_URL}/terms`;

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/today');
}

export default function Paywall() {
  const { session, saveProfile } = useSession();
  const [provider, setProvider] = useState<PaymentProvider>(() => getPaymentProvider());
  const [planId, setPlanId] = useState(provider.plans[1]?.id ?? 'pro_yearly');
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    getNativePaymentProvider()
      .then((p) => {
        setProvider(p);
        setPlanId(p.plans[1]?.id ?? p.plans[0]?.id ?? 'pro_yearly');
      })
      .catch(() => {});
  }, []);

  async function grantPremium() {
    await saveProfile({ is_premium: true, paywall_dismissed: true });
    Alert.alert('Welcome to Pro', 'Unlimited scans unlocked.');
    goBack();
  }

  async function handlePurchase() {
    setBusy(true);
    try {
      const ok = await provider.purchase(planId, {
        userId: session?.user.id,
        email: session?.user.email ?? undefined,
      });
      if (ok) await grantPremium();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Please try again.';
      if (!/cancel/i.test(message)) {
        Alert.alert('Purchase failed', message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    if (!provider.restore) return;
    setRestoring(true);
    try {
      const ok = await provider.restore();
      if (ok) {
        await grantPremium();
      } else {
        Alert.alert('No subscription found', 'We could not find an active Pro subscription for this account.');
      }
    } catch (e: unknown) {
      Alert.alert('Restore failed', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setRestoring(false);
    }
  }

  async function handleDismiss() {
    try {
      await saveProfile({ paywall_dismissed: true });
    } catch {
      // Non-fatal — user can still browse free tier.
    }
    goBack();
  }

  function renderPlan(plan: PaymentPlan) {
    const selected = planId === plan.id;
    return (
      <Pressable
        key={plan.id}
        onPress={() => setPlanId(plan.id)}
        style={[styles.plan, selected && styles.planSelected]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.planTitle, selected && { color: colors.accent }]}>{plan.title}</Text>
          <Text style={styles.planCaption}>{plan.caption}</Text>
        </View>
        <Text style={[styles.planPrice, selected && { color: colors.accent }]}>{plan.price}</Text>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable onPress={handleDismiss} hitSlop={12} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>

        <Text style={styles.kicker}>PROTEINQUEST PRO</Text>
        <Text style={styles.title}>Never stop{'\n'}counting.</Text>
        <Text style={styles.subtitle}>
          Free includes {FREE_DAILY_SCANS} AI scans a day. Go Pro for unlimited scans.
        </Text>

        <View style={styles.perks}>
          {PERKS.map((p) => (
            <View key={p.icon} style={styles.perkRow}>
              <Ionicons name={p.icon} size={20} color={colors.accent} />
              <Text style={styles.perkText}>{p.text}</Text>
            </View>
          ))}
        </View>

        <View style={{ gap: spacing.sm }}>{provider.plans.map(renderPlan)}</View>

        <Text style={styles.legal}>
          Payment will be charged to your {Platform.OS === 'ios' ? 'Apple ID' : Platform.OS === 'android' ? 'Google Play' : 'payment method'} account at confirmation of purchase.
          Subscription automatically renews unless cancelled at least 24 hours before the end of the
          current period. Manage or cancel anytime in your device subscription settings. By
          subscribing you agree to our{' '}
          <Text style={styles.legalLink} onPress={() => Linking.openURL(TERMS_URL)}>
            Terms of Use
          </Text>{' '}
          and{' '}
          <Text style={styles.legalLink} onPress={() => Linking.openURL(PRIVACY_URL)}>
            Privacy Policy
          </Text>
          .
        </Text>

        <Button
          title={
            !provider.isConfigured && !__DEV__
              ? 'Subscriptions unavailable'
              : 'Subscribe'
          }
          onPress={handlePurchase}
          loading={busy}
          disabled={!provider.isConfigured && !__DEV__}
          style={{ marginTop: spacing.md }}
        />

        {provider.restore ? (
          <Button
            title="Restore purchases"
            variant="secondary"
            onPress={handleRestore}
            loading={restoring}
            style={{ marginTop: spacing.sm }}
          />
        ) : null}

        <Button title="Not now" variant="ghost" onPress={handleDismiss} style={{ marginTop: spacing.sm }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2.5,
    color: colors.accent,
  },
  title: {
    fontSize: 40,
    fontWeight: '800',
    color: colors.text,
    marginTop: spacing.sm,
    fontFamily: fonts.displayHeavy,
    letterSpacing: -1.2,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 22,
    fontFamily: fonts.body,
  },
  perks: { gap: spacing.md, marginVertical: spacing.xl },
  perkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  perkText: { fontSize: 15, fontWeight: '600', color: colors.text, fontFamily: fonts.body },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.hairlineBright,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  planSelected: { borderColor: colors.accent, backgroundColor: colors.accentSurface },
  planTitle: { fontSize: 16, fontWeight: '700', color: colors.text, fontFamily: fonts.displayMedium },
  planCaption: { fontSize: 13, color: colors.textSecondary, marginTop: 2, fontFamily: fonts.body },
  planPrice: { fontSize: 17, fontWeight: '800', color: colors.text, fontFamily: fonts.display },
  legal: {
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: spacing.md,
    lineHeight: 16,
    fontFamily: fonts.body,
  },
  legalLink: { color: colors.accent, textDecorationLine: 'underline' },
});
