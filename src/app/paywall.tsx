import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { FREE_DAILY_SCANS, getPaymentProvider } from '@/lib/payments';
import { useSession } from '@/lib/session';
import { colors, fonts, radius, spacing } from '@/theme';

const PERKS = [
  { icon: 'infinite' as const, text: 'Unlimited AI scans every day' },
  { icon: 'time' as const, text: 'Full history & trends forever' },
  { icon: 'flash' as const, text: 'Priority analysis speed' },
];

export default function Paywall() {
  const { saveProfile } = useSession();
  const provider = getPaymentProvider();
  const [planId, setPlanId] = useState(provider.plans[1].id);
  const [busy, setBusy] = useState(false);

  async function handlePurchase() {
    setBusy(true);
    try {
      const ok = await provider.purchase(planId);
      if (ok) {
        await saveProfile({ is_premium: true });
        Alert.alert('Welcome to Pro', 'Unlimited scans unlocked.');
        router.back();
      }
    } catch (e: any) {
      Alert.alert('Purchase failed', e.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>

        <Text style={styles.kicker}>PROTEINLENS PRO</Text>
        <Text style={styles.title}>Never stop{'\n'}counting.</Text>
        <Text style={styles.subtitle}>
          Free includes {FREE_DAILY_SCANS} AI scans a day. Go Pro for unlimited.
        </Text>

        <View style={styles.perks}>
          {PERKS.map((p) => (
            <View key={p.icon} style={styles.perkRow}>
              <Ionicons name={p.icon} size={20} color={colors.accent} />
              <Text style={styles.perkText}>{p.text}</Text>
            </View>
          ))}
        </View>

        <View style={{ gap: spacing.sm }}>
          {provider.plans.map((plan) => {
            const selected = planId === plan.id;
            return (
              <Pressable
                key={plan.id}
                onPress={() => setPlanId(plan.id)}
                style={[styles.plan, selected && styles.planSelected]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.planTitle, selected && { color: colors.accent }]}>
                    {plan.title}
                  </Text>
                  <Text style={styles.planCaption}>{plan.caption}</Text>
                </View>
                <Text style={[styles.planPrice, selected && { color: colors.accent }]}>
                  {plan.price}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {!provider.isConfigured ? (
          <Text style={styles.devNote}>
            Payments aren&apos;t connected yet (RevenueCat for app stores, Stripe for
            web). This button unlocks Pro for testing.
          </Text>
        ) : null}

        <Button
          title={provider.isConfigured ? 'Continue' : 'Unlock Pro (test mode)'}
          onPress={handlePurchase}
          loading={busy}
          style={{ marginTop: spacing.md }}
        />
        <Button title="Not now" variant="ghost" onPress={() => router.back()} />
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
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  kicker: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2.5,
    color: colors.accent,
  },
  title: {
    fontSize: 40,
    fontWeight: '800',
    color: colors.text,
    marginTop: spacing.sm,
    fontFamily: fonts?.rounded,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  perks: { gap: spacing.md, marginVertical: spacing.xl },
  perkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  perkText: { fontSize: 15, fontWeight: '600', color: colors.text },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  planSelected: { borderColor: colors.accent, backgroundColor: '#15180F' },
  planTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  planCaption: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  planPrice: { fontSize: 17, fontWeight: '800', color: colors.text },
  devNote: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: spacing.md,
    lineHeight: 17,
  },
});
