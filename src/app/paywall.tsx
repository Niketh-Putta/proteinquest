import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GlassPanel } from '@/components/GlassPanel';
import { trackEvent } from '@/lib/analytics';
import { APP_STORE_URL, PLAY_STORE_URL } from '@/lib/app-update';
import { useContentColumn, useLayout } from '@/lib/layout';
import {
  getNativePaymentProvider,
  getPaymentProvider,
  type PaymentPlan,
  type PaymentProvider,
} from '@/lib/payments';
import { SITE_URL } from '@/lib/site';
import { useSession } from '@/lib/session';
import { colors, fonts, layout, pressableWeb, radius, spacing } from '@/theme';

const IS_WEB = Platform.OS === 'web';

const ACCENT = '#FF8B6A';
const ACCENT_SOFT = '#FFB090';
const MUTED = '#9A95A8';
const LINK = '#A78BFA';
const SERIF = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  web: 'Georgia, "Times New Roman", serif',
  default: 'serif',
})!;

const PERKS = [
  {
    icon: 'nutrition' as const,
    title: 'Hit protein without thinking',
    text: 'Snap the plate. Get the number. Stay on goal without logging gymnastics.',
  },
  {
    icon: 'infinite' as const,
    title: 'Unlimited AI scans',
    text: 'Every meal, every day. Built for busy people who pay for results.',
  },
  {
    icon: 'sparkles' as const,
    title: 'Smarter estimates',
    text: 'Sharper plate and label reads. Protein and calories you can trust.',
  },
  {
    icon: 'flame' as const,
    title: 'Dragon + leagues',
    text: 'Optional game layer so the habit sticks when willpower dips.',
  },
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

function formatPrice(price: string): { amount: string; period: string } {
  const m = price.match(/^(.*?)(\s*\/?\s*(wk|yr|mo|week|year|month).*)$/i);
  if (!m) return { amount: price, period: '' };
  const period = m[2].replace(/^\s*\/?\s*/, '/').replace(/\s+/g, '');
  return { amount: m[1].trim(), period: period.startsWith('/') ? period : `/${period}` };
}

function GradientWord({ children, size = 40 }: { children: string; size?: number }) {
  const typeStyle = { fontSize: size, lineHeight: Math.round(size * 1.15) };
  if (Platform.OS === 'web') {
    return (
      <Text style={[styles.titleWord, typeStyle, styles.gradientWordWeb]}>{children}</Text>
    );
  }
  return <Text style={[styles.titleWord, typeStyle, { color: ACCENT_SOFT }]}>{children}</Text>;
}

export default function Paywall() {
  const { session, saveProfile } = useSession();
  const { isNarrow, isVeryNarrow, isTinyH } = useLayout();
  const column = useContentColumn('form');
  const titleSize = isVeryNarrow || isTinyH ? 32 : isNarrow ? 36 : 40;
  const [provider, setProvider] = useState<PaymentProvider>(() => getPaymentProvider());
  const [planId, setPlanId] = useState(provider.plans[1]?.id ?? 'pro_yearly');
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(!IS_WEB);

  /** Native IAP only; web laptop cannot run App Store / Play Billing. */
  const canPurchase =
    !IS_WEB &&
    !loadingPlans &&
    (provider.isConfigured || !!__DEV__) &&
    provider.offeringsReady !== false;

  useEffect(() => {
    trackEvent('paywall_view', {});
  }, []);

  useEffect(() => {
    if (IS_WEB) return;
    const userId = session?.user.id;
    if (!userId) return;
    setLoadingPlans(true);
    getNativePaymentProvider(userId)
      .then((p) => {
        setProvider(p);
        setPlanId(p.plans[1]?.id ?? p.plans[0]?.id ?? 'pro_yearly');
      })
      .catch(() => {})
      .finally(() => setLoadingPlans(false));
  }, [session?.user.id]);

  async function grantPremium() {
    await saveProfile({ is_premium: true, paywall_dismissed: true });
    trackEvent('paywall_purchase', { plan_id: planId });
    Alert.alert('Welcome to Pro', 'Protein on autopilot. Unlimited AI scans are unlocked.');
    goBack();
  }

  async function handlePurchase() {
    if (!canPurchase) return;
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
        Alert.alert(
          'No subscription found',
          'We could not find an active Pro subscription for this account.',
        );
      }
    } catch (e: unknown) {
      Alert.alert('Restore failed', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setRestoring(false);
    }
  }

  async function handleDismiss() {
    trackEvent('paywall_dismiss', {});
    try {
      await saveProfile({ paywall_dismissed: true });
    } catch {
      /* non-fatal */
    }
    goBack();
  }

  function renderPlan(plan: PaymentPlan) {
    const selected = planId === plan.id;
    const yearly = /year/i.test(plan.id) || /year/i.test(plan.title);
    const { amount, period } = formatPrice(plan.price);

    return (
      <Pressable
        key={plan.id}
        onPress={() => setPlanId(plan.id)}
        style={pressableWeb}
        accessibilityRole="button"
        accessibilityState={{ selected }}>
        <View style={[styles.planOuter, selected && styles.planOuterSelected]}>
          {selected ? (
            <LinearGradient
              colors={['rgba(255,122,89,0.55)', 'rgba(255,176,120,0.35)', 'rgba(155,140,255,0.25)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          <View style={[styles.planInner, selected && styles.planInnerSelected]}>
            <View style={styles.planLeft}>
              <View style={styles.planTitleRow}>
                <Text style={[styles.planTitle, selected && styles.planTitleSelected]}>
                  {plan.title}
                </Text>
                {yearly ? (
                  <View style={styles.bestValue}>
                    <Text style={styles.bestValueText}>BEST VALUE</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.planCaption, selected && styles.planCaptionSelected]}>
                {plan.caption}
                {/cancel/i.test(plan.caption) && !plan.caption.endsWith('.') ? '.' : ''}
              </Text>
            </View>
            <View style={styles.planRight}>
              <View style={styles.priceCol}>
                <View style={styles.priceRow}>
                  <Text style={[styles.planAmount, selected && styles.planAmountSelected]}>
                    {amount}
                  </Text>
                  {period ? (
                    <Text style={[styles.planPeriod, selected && styles.planAmountSelected]}>
                      {' '}
                      {period}
                    </Text>
                  ) : null}
                </View>
              </View>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={selected ? ACCENT : MUTED}
                style={{ marginLeft: 4 }}
              />
            </View>
          </View>
        </View>
      </Pressable>
    );
  }

  const ctaLabel = loadingPlans
    ? 'Loading…'
    : provider.offeringsReady === false
      ? 'Unavailable'
      : 'Subscribe';

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1C1018', '#0B0A12', '#080810']}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView
          contentContainerStyle={[styles.scroll, column]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <Pressable
              onPress={handleDismiss}
              hitSlop={16}
              style={pressableWeb}
              accessibilityLabel="Close">
              <Ionicons name="close" size={22} color="#E8E4F0" />
            </Pressable>
            <View style={[styles.brandRow, { flexShrink: 1, minWidth: 0 }]}>
              <Ionicons name="diamond" size={11} color={ACCENT_SOFT} />
              <Text style={styles.brand} numberOfLines={1} ellipsizeMode="tail">
                PROTEINQUEST <Text style={styles.brandPro}>PRO</Text>
              </Text>
            </View>
            <View style={{ width: 22, flexShrink: 0 }} />
          </View>

          <Text
            style={[
              styles.title,
              { fontSize: titleSize, lineHeight: Math.round(titleSize * 1.15) },
            ]}
            numberOfLines={isVeryNarrow ? 3 : 2}>
            Hit protein{'\n'}
            <GradientWord size={titleSize}>without thinking.</GradientWord>
          </Text>
          <Text style={[styles.subtitle, isNarrow && { fontSize: 13, lineHeight: 19 }]}>
            The protein habit for busy people who pay for results. Unlimited AI scans, then dragon
            and league if you want the game layer.
          </Text>

          <GlassPanel style={styles.perksCard}>
            {PERKS.map((p, i) => (
              <View
                key={p.title}
                style={[styles.perkRow, i < PERKS.length - 1 && styles.perkDivider]}>
                <View style={styles.perkIcon}>
                  <Ionicons name={p.icon} size={15} color={ACCENT} />
                </View>
                <View style={styles.perkCopy}>
                  <Text style={styles.perkTitle}>{p.title}</Text>
                  <Text style={styles.perkText}>{p.text}</Text>
                </View>
                <Ionicons name="sparkles" size={10} color="rgba(255,176,144,0.55)" />
              </View>
            ))}
          </GlassPanel>

          <Text style={styles.sectionLabel}>CHOOSE A PLAN</Text>
          <View style={styles.plans}>
            {loadingPlans ? (
              <Text style={styles.offeringsWarning}>Loading subscription plans…</Text>
            ) : (
              provider.plans.map(renderPlan)
            )}
          </View>

          {IS_WEB ? (
            <View style={styles.webStoreBlock}>
              <Text style={styles.webStoreHint}>
                Open ProteinQuest on your phone to subscribe. Purchases are not available in the
                browser.
              </Text>
              <Pressable
                onPress={() => Linking.openURL(APP_STORE_URL)}
                style={({ pressed }) => [
                  styles.cta,
                  styles.ctaGrouped,
                  styles.ctaReady,
                  pressed && { opacity: 0.9 },
                  pressableWeb,
                ]}>
                <Text style={[styles.ctaText, styles.ctaTextReady]}>Get the app</Text>
              </Pressable>
              <Pressable
                onPress={() => Linking.openURL(PLAY_STORE_URL)}
                style={({ pressed }) => [
                  styles.cta,
                  styles.ctaGrouped,
                  styles.ctaSecondary,
                  pressed && { opacity: 0.9 },
                  pressableWeb,
                ]}>
                <Text style={styles.ctaTextSecondary}>Google Play</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={handlePurchase}
              disabled={!canPurchase || busy}
              style={({ pressed }) => [
                styles.cta,
                !canPurchase && styles.ctaDisabled,
                canPurchase && styles.ctaReady,
                pressed && canPurchase && { opacity: 0.9 },
                pressableWeb,
              ]}>
              {busy || loadingPlans ? (
                <ActivityIndicator color={canPurchase ? colors.onAccent : MUTED} />
              ) : (
                <Text style={[styles.ctaText, canPurchase && styles.ctaTextReady]}>{ctaLabel}</Text>
              )}
            </Pressable>
          )}

          <Pressable onPress={handleDismiss} style={[styles.notNowWrap, pressableWeb]}>
            <Text style={styles.notNow}>Not now</Text>
          </Pressable>

          {!IS_WEB && provider.restore ? (
            <Pressable
              onPress={handleRestore}
              disabled={restoring}
              style={[styles.restoreWrap, pressableWeb]}>
              <Text style={styles.restore}>{restoring ? 'Restoring…' : 'Restore purchases'}</Text>
            </Pressable>
          ) : null}

          <Text style={styles.legal}>
            {IS_WEB
              ? 'Subscriptions are purchased in the ProteinQuest iOS or Android app through Apple or Google. '
              : `Payment will be charged to your ${
                  Platform.OS === 'ios' ? 'Apple ID' : 'Google Play'
                } account at confirmation of purchase. Subscription automatically renews unless cancelled at least 24 hours before the end of the current period. Manage or cancel anytime in your device subscription settings. `}
            By continuing you agree to our{' '}
            <Text style={styles.legalLink} onPress={() => Linking.openURL(TERMS_URL)}>
              Terms of Use
            </Text>{' '}
            and{' '}
            <Text style={styles.legalLink} onPress={() => Linking.openURL(PRIVACY_URL)}>
              Privacy Policy
            </Text>
            .
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080810' },
  safe: { flex: 1 },
  scroll: {
    paddingBottom: spacing.xxl,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 10,
    zIndex: 3,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brand: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 2.2,
    color: '#EDE8F4',
  },
  brandPro: {
    color: ACCENT_SOFT,
  },
  title: {
    fontFamily: SERIF,
    fontSize: 40,
    lineHeight: 46,
    color: '#FFFFFF',
    letterSpacing: -0.6,
    marginTop: 4,
    maxWidth: '100%',
  },
  titleWord: {
    fontFamily: SERIF,
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: -0.6,
  },
  gradientWordWeb:
    Platform.OS === 'web'
      ? ({
          backgroundImage: 'linear-gradient(100deg, #FFD0B8 0%, #FF8B6A 55%, #FF6B4A 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
        } as object)
      : {},
  subtitle: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 21,
    color: MUTED,
    fontFamily: fonts.body,
    maxWidth: 360,
  },
  perksCard: {
    marginTop: 16,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,160,120,0.22)',
    backgroundColor: 'rgba(18,16,28,0.55)',
  },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
  },
  perkDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  perkIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  perkCopy: { flex: 1, gap: 2, paddingRight: 4 },
  perkTitle: {
    fontFamily: fonts.displayMedium,
    fontSize: 14,
    color: '#F4F1F8',
  },
  perkText: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
    color: MUTED,
  },
  sectionLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 2.4,
    color: '#6E687C',
    marginTop: 26,
    marginBottom: 12,
  },
  plans: { gap: 10 },
  planOuter: {
    borderRadius: 18,
    padding: 1.5,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  planOuterSelected: {
    backgroundColor: 'transparent',
  },
  planInner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16.5,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(14,12,22,0.92)',
  },
  planInnerSelected: {
    backgroundColor: 'rgba(28,16,18,0.95)',
  },
  planLeft: { flex: 1, minWidth: 0, paddingRight: 8 },
  planTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    minWidth: 0,
  },
  planTitle: {
    fontSize: 17,
    color: '#F6F4F8',
    fontFamily: fonts.displayMedium,
    flexShrink: 1,
  },
  planTitleSelected: { color: ACCENT },
  bestValue: {
    backgroundColor: '#C4A06A',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  bestValueText: {
    fontFamily: fonts.monoBold,
    fontSize: 8,
    letterSpacing: 0.6,
    color: '#1A1208',
  },
  planCaption: {
    fontSize: 12,
    color: MUTED,
    marginTop: 3,
    fontFamily: fonts.body,
  },
  planCaptionSelected: { color: ACCENT_SOFT },
  planRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceCol: {
    alignItems: 'flex-end',
    gap: 1,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  planAmount: {
    fontSize: 17,
    color: '#F6F4F8',
    fontFamily: fonts.display,
  },
  planAmountSelected: { color: ACCENT },
  planPeriod: {
    fontSize: 13,
    color: MUTED,
    fontFamily: fonts.body,
  },
  webStoreBlock: {
    marginTop: spacing.md,
    gap: 10,
  },
  webStoreHint: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: MUTED,
    textAlign: 'center',
    marginBottom: 2,
  },
  cta: {
    marginTop: spacing.md,
    height: layout.controlHeight,
    borderRadius: radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  // Nested CTAs inside webStoreBlock already have block-level top spacing.
  ctaGrouped: {
    marginTop: 0,
  },
  ctaDisabled: {
    opacity: 0.85,
  },
  ctaReady: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  ctaSecondary: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.16)',
  },
  ctaText: {
    fontFamily: fonts.displayMedium,
    fontSize: 15,
    color: MUTED,
  },
  ctaTextReady: {
    color: colors.onAccent,
  },
  ctaTextSecondary: {
    fontFamily: fonts.displayMedium,
    fontSize: 15,
    color: colors.text,
  },
  notNowWrap: {
    alignSelf: 'center',
    marginTop: spacing.md,
    paddingVertical: spacing.xs,
  },
  notNow: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: LINK,
    textDecorationLine: 'underline',
  },
  restoreWrap: {
    alignSelf: 'center',
    marginTop: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  restore: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: '#6E687C',
    letterSpacing: 0.3,
  },
  offeringsWarning: {
    fontSize: 13,
    color: MUTED,
    lineHeight: 18,
    fontFamily: fonts.body,
  },
  legal: {
    fontSize: 10,
    color: '#5A5568',
    marginTop: spacing.md + 2,
    lineHeight: 15,
    fontFamily: fonts.body,
    textAlign: 'center',
  },
  legalLink: { color: LINK, textDecorationLine: 'underline' },
});
