import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInRight,
  FadeOutLeft,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { DRAGONS, VISUAL_EVOLUTION_LEVELS } from '@/lib/character';
import { useLayout, usePinnedFooterGap } from '@/lib/layout';
import { useSession } from '@/lib/session';
import { colors, fonts, noTextCaret, pressableWeb, radius, spacing } from '@/theme';

/** Reference frame size - all visual internals are proportional to this. */
const VIS_REF = 280;

function v(size: number, n: number) {
  return (size / VIS_REF) * n;
}

const STEPS = [
  {
    kicker: 'SCAN',
    title: 'Snap meals, get protein',
    body: 'Point your camera at any meal. AI counts the protein in seconds.',
    visual: 'scan' as const,
  },
  {
    kicker: 'DAILY GOAL',
    title: 'One target every day',
    body: 'Set your protein goal once. Hit it consistently - that is the game.',
    visual: 'goal' as const,
  },
  {
    kicker: 'YOUR DRAGON',
    title: 'Pick one dragon daily',
    body: 'Choose Ember, Frost, or Moss each morning. Locked in for the day.',
    visual: 'pick' as const,
  },
  {
    kicker: 'EVOLVE',
    title: 'Grow your dragon',
    body: 'Hit your goal to earn XP. Five forms unlock as you level up.',
    visual: 'grow' as const,
  },
  {
    kicker: 'START',
    title: 'Build the habit',
    body: 'Set your target, pick your dragon, and scan your first meal.',
    visual: 'start' as const,
  },
];

function VisualFrame({
  size,
  children,
  style,
}: {
  size: number;
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <View style={[styles.visualFrame, { width: '100%', maxWidth: size, height: size }, style]}>
      {children}
    </View>
  );
}

const CHICKEN_CURRY = require('../../assets/intro/chicken-curry.jpg');

function ScanSweepLine({ size }: { size: number }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1300, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [y]);
  const style = useAnimatedStyle(() => ({
    top: `${8 + y.value * 84}%`,
  }));
  return (
    <Animated.View
      style={[
        styles.scanSweepLine,
        { height: v(size, 2) },
        style,
      ]}
    />
  );
}

function ScanVisual({ size }: { size: number }) {
  const corner = v(size, 32);
  const inset = v(size, 24);
  const frameInset = v(size, 16);
  const mealSize = size - frameInset * 2;
  const mealRadius = v(size, 12);
  const labelPulse = useSharedValue(1);
  useEffect(() => {
    labelPulse.value = withRepeat(
      withSequence(
        withTiming(0.55, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [labelPulse]);
  const labelStyle = useAnimatedStyle(() => ({ opacity: labelPulse.value }));

  return (
    <VisualFrame size={size} style={styles.scanFrame}>
      <View
        style={[
          styles.scanMealWrap,
          {
            width: mealSize,
            height: mealSize,
            borderRadius: mealRadius,
            margin: frameInset,
          },
        ]}>
        <Image
          source={CHICKEN_CURRY}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
        <View style={[styles.scanMealDim, { borderRadius: mealRadius }]} />
        <ScanSweepLine size={size} />
        <Animated.View
          entering={FadeIn.delay(400).duration(500)}
          style={[
            styles.scanAnalyzingBadge,
            {
              paddingHorizontal: v(size, 10),
              paddingVertical: v(size, 5),
              borderRadius: v(size, 16),
              gap: v(size, 5),
            },
          ]}>
          <Ionicons name="scan" size={v(size, 12)} color={colors.accent} />
          <Animated.Text
            style={[
              styles.scanAnalyzingText,
              { fontSize: v(size, 9), letterSpacing: v(size, 1.2) },
              labelStyle,
            ]}>
            ANALYZING...
          </Animated.Text>
        </Animated.View>
      </View>
      <View
        style={[
          styles.scanCornerTL,
          { top: inset, left: inset, width: corner, height: corner, borderTopWidth: v(size, 3), borderLeftWidth: v(size, 3), borderTopLeftRadius: v(size, 8) },
        ]}
      />
      <View
        style={[
          styles.scanCornerBR,
          {
            bottom: inset,
            right: inset,
            width: corner,
            height: corner,
            borderBottomWidth: v(size, 3),
            borderRightWidth: v(size, 3),
            borderBottomRightRadius: v(size, 8),
          },
        ]}
      />
      <Animated.View
        entering={FadeInDown.delay(1200).duration(600)}
        style={[
          styles.scanResultPill,
          styles.scanResultPillOverlay,
          {
            bottom: inset + v(size, 8),
            paddingHorizontal: v(size, 14),
            paddingVertical: v(size, 6),
            borderRadius: v(size, 20),
            gap: v(size, 6),
          },
        ]}>
        <Text style={{ fontFamily: fonts.displayHeavy, fontSize: v(size, 18), color: colors.accent }}>42g</Text>
        <Text style={{ fontFamily: fonts.mono, fontSize: v(size, 9), letterSpacing: v(size, 1.5), color: colors.textTertiary }}>PROTEIN</Text>
      </Animated.View>
    </VisualFrame>
  );
}

function GoalVisual({ size }: { size: number }) {
  const ringSize = v(size, 100);
  const ringBorder = v(size, 9);
  return (
    <VisualFrame size={size} style={styles.goalFrame}>
      <Text
        style={{
          fontFamily: fonts.displayHeavy,
          fontSize: v(size, 56),
          lineHeight: v(size, 60),
          color: colors.accent,
          letterSpacing: v(size, -2),
        }}>
        120
      </Text>
      <Text
        style={{
          fontFamily: fonts.mono,
          fontSize: v(size, 10),
          letterSpacing: v(size, 2),
          color: colors.textTertiary,
        }}>
        g protein / day
      </Text>
      <View
        style={{
          width: ringSize,
          height: ringSize,
          borderRadius: ringSize / 2,
          borderWidth: ringBorder,
          borderColor: colors.ringTrack,
          marginTop: v(size, 12),
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <View
          style={{
            position: 'absolute',
            width: ringSize,
            height: ringSize,
            borderRadius: ringSize / 2,
            borderWidth: ringBorder,
            borderColor: colors.accent,
            borderRightColor: 'transparent',
            borderBottomColor: 'transparent',
            transform: [{ rotate: '-45deg' }],
          }}
        />
        <Text style={{ fontFamily: fonts.mono, fontSize: v(size, 11), color: colors.textSecondary }}>78%</Text>
      </View>
    </VisualFrame>
  );
}

function PickDragonVisual({ size }: { size: number }) {
  const cardW = v(size, 72);
  const cardH = v(size, 88);
  const artSize = v(size, 52);
  const gap = v(size, 10);
  const selected = DRAGONS[0];

  return (
    <VisualFrame size={size}>
      <View style={{ flexDirection: 'row', gap, alignItems: 'flex-end' }}>
        {DRAGONS.map((dragon) => {
          const active = dragon.id === selected.id;
          return (
            <View
              key={dragon.id}
              style={{
                width: cardW,
                height: cardH,
                borderRadius: v(size, 14),
                backgroundColor: active ? colors.accentSurface : colors.surface2,
                borderWidth: active ? v(size, 2) : StyleSheet.hairlineWidth,
                borderColor: active ? colors.accent : colors.hairline,
                alignItems: 'center',
                justifyContent: 'center',
                gap: v(size, 4),
                opacity: active ? 1 : 0.55,
              }}>
              <Image source={dragon.previewArt} style={{ width: artSize, height: artSize }} contentFit="contain" />
              <Text
                style={{
                  fontFamily: fonts.displayMedium,
                  fontSize: v(size, 10),
                  color: active ? dragon.accent : colors.textTertiary,
                }}>
                {dragon.name}
              </Text>
            </View>
          );
        })}
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: v(size, 5),
          marginTop: v(size, 14),
          paddingHorizontal: v(size, 12),
          paddingVertical: v(size, 5),
          borderRadius: v(size, 20),
          backgroundColor: colors.surface2,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.hairlineBright,
        }}>
        <Ionicons name="lock-closed" size={v(size, 11)} color={colors.textTertiary} />
        <Text
          style={{
            fontFamily: fonts.mono,
            fontSize: v(size, 9),
            letterSpacing: v(size, 1.2),
            color: colors.textTertiary,
          }}>
          LOCKED FOR TODAY
        </Text>
      </View>
    </VisualFrame>
  );
}

function GrowVisual({ size }: { size: number }) {
  const previewDragon = DRAGONS[0];
  const artSize = v(size, 100);
  const dotSize = v(size, 8);
  const stages = VISUAL_EVOLUTION_LEVELS.length;

  return (
    <VisualFrame size={size}>
      <Image source={previewDragon.previewArt} style={{ width: artSize, height: artSize }} contentFit="contain" />
      <View style={{ flexDirection: 'row', gap: v(size, 6), marginTop: v(size, 10), alignItems: 'center' }}>
        {VISUAL_EVOLUTION_LEVELS.map((level, i) => (
          <View key={level} style={{ alignItems: 'center', gap: v(size, 3) }}>
            <View
              style={{
                width: dotSize,
                height: dotSize,
                borderRadius: dotSize / 2,
                backgroundColor: i < 2 ? colors.accent : colors.ringTrack,
              }}
            />
            <Text
              style={{
                fontFamily: fonts.mono,
                fontSize: v(size, 7),
                color: i < 2 ? colors.accent : colors.textTertiary,
              }}>
              Lv{level}
            </Text>
          </View>
        ))}
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: v(size, 5),
          marginTop: v(size, 10),
          paddingHorizontal: v(size, 10),
          paddingVertical: v(size, 4),
          borderRadius: v(size, 16),
          backgroundColor: colors.accentSurface,
        }}>
        <Ionicons name="arrow-up" size={v(size, 10)} color={colors.accent} />
        <Text
          style={{
            fontFamily: fonts.mono,
            fontSize: v(size, 9),
            letterSpacing: v(size, 1),
            color: colors.accent,
          }}>
          {stages} FORMS TO UNLOCK
        </Text>
      </View>
    </VisualFrame>
  );
}

function StartVisual({ size }: { size: number }) {
  const previewDragon = DRAGONS[0];
  const artSize = v(size, 160);
  return (
    <VisualFrame size={size}>
      <Image source={previewDragon.previewArt} style={{ width: artSize, height: artSize }} contentFit="contain" />
      <Text
        style={{
          fontFamily: fonts.mono,
          fontSize: v(size, 10),
          letterSpacing: v(size, 2),
          color: colors.accentSecondary,
          marginTop: v(size, 4),
        }}>
        YOUR COMPANION AWAITS
      </Text>
    </VisualFrame>
  );
}

function StepVisual({ kind, size }: { kind: (typeof STEPS)[number]['visual']; size: number }) {
  switch (kind) {
    case 'scan':
      return <ScanVisual size={size} />;
    case 'goal':
      return <GoalVisual size={size} />;
    case 'pick':
      return <PickDragonVisual size={size} />;
    case 'grow':
      return <GrowVisual size={size} />;
    case 'start':
      return <StartVisual size={size} />;
  }
}

export default function IntroScreen() {
  const { saveProfile, loading: sessionLoading, session } = useSession();
  const { horizontalPad, contentMaxWidth, isWide, height, width } = useLayout();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isCompact = height < 700 || width < 390;
  const visualSize = Math.min(
    isWide ? 320 : width - horizontalPad * 2,
    isCompact
      ? Math.min(width * 0.56, height * 0.2, 176)
      : height < 720
        ? Math.max(168, height * 0.28)
        : 320,
  );
  const footerGap = usePinnedFooterGap(isCompact);

  async function finish() {
    if (sessionLoading || !session) {
      setError('Still connecting — please wait a moment and try again.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveProfile({ intro_completed: true });
      router.replace('/onboarding');
    } catch (e: unknown) {
      if (__DEV__ && e) console.error('[intro] saveProfile failed:', e);
      setError(e instanceof Error ? e.message : 'Could not save progress');
      setSaving(false);
    }
  }

  function handleNext() {
    if (isLast) {
      finish();
      return;
    }
    setStep((s) => s + 1);
  }

  function handleBack() {
    if (step > 0) setStep((s) => s - 1);
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.bgRaised, colors.bg]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View
            style={[
              styles.inner,
              { paddingHorizontal: horizontalPad, maxWidth: contentMaxWidth },
            ]}>
            <View style={[styles.header, isCompact && styles.headerCompact]}>
              <View style={[styles.dots, isCompact && styles.dotsCompact]}>
                {STEPS.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      isCompact && styles.dotCompact,
                      i === step && styles.dotActive,
                      i === step && isCompact && styles.dotActiveCompact,
                    ]}
                  />
                ))}
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={handleBack}
                disabled={step === 0}
                style={[styles.backBtn, isCompact && styles.backBtnCompact, step === 0 && { opacity: 0 }]}>
                <Ionicons
                  name="chevron-back"
                  size={isCompact ? 20 : 22}
                  color={colors.textSecondary}
                />
              </Pressable>
            </View>

            <ScrollView
              style={styles.flex}
              contentContainerStyle={[
                styles.scrollContent,
                isCompact && styles.scrollContentCompact,
                { paddingBottom: isCompact ? spacing.md : spacing.lg },
              ]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces>
              <Animated.View
                key={step}
                entering={FadeInRight.duration(280)}
                exiting={FadeOutLeft.duration(200)}
                style={[styles.slide, isWide && styles.slideWide]}>
                <Animated.View
                  entering={FadeIn.delay(60)}
                  style={[styles.visualWrap, isCompact && styles.visualWrapCompact]}>
                  <StepVisual kind={current.visual} size={visualSize} />
                </Animated.View>

                <Text style={[styles.kicker, isCompact && styles.kickerCompact]}>{current.kicker}</Text>
                <Text
                  style={[
                    styles.title,
                    isWide && styles.titleWide,
                    isCompact ? styles.titleCompact : height < 720 && styles.titleShort,
                  ]}>
                  {current.title}
                </Text>
                <Text style={[styles.body, isCompact && styles.bodyCompact]}>{current.body}</Text>
              </Animated.View>
            </ScrollView>

            <View
              style={[
                styles.footer,
                isCompact && styles.footerCompact,
                { paddingBottom: footerGap, paddingTop: isCompact ? spacing.sm : spacing.md },
              ]}>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button
                title={isLast ? 'Get started' : 'Next'}
                onPress={handleNext}
                loading={saving || sessionLoading}
                disabled={sessionLoading || !session}
                style={{
                  alignSelf: 'center',
                  width: isCompact ? '82%' : '100%',
                  maxWidth: isCompact ? 272 : undefined,
                  height: isCompact ? 44 : 52,
                }}
              />
              {!isLast ? (
                <Pressable
                  onPress={finish}
                  disabled={saving}
                  style={[styles.skipBtn, pressableWeb, isCompact && styles.skipBtnCompact]}>
                  <Text selectable={false} pointerEvents="none" style={styles.skipText}>
                    Skip intro
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  flex: { flex: 1 },
  inner: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    paddingTop: spacing.md,
  },
  headerCompact: {
    paddingTop: spacing.sm,
  },
  scrollContent: {
    paddingTop: spacing.sm,
  },
  scrollContentCompact: {
    paddingTop: spacing.xs,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: spacing.sm,
  },
  dotsCompact: {
    gap: 5,
    marginBottom: spacing.xs,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
    backgroundColor: colors.hairlineBright,
  },
  dotCompact: {
    width: 5,
    height: 5,
  },
  dotActive: {
    width: 22,
    backgroundColor: colors.accent,
  },
  dotActiveCompact: {
    width: 16,
  },
  backBtn: {
    alignSelf: 'flex-start',
    padding: spacing.xs,
    marginBottom: spacing.xs,
  },
  backBtnCompact: {
    marginBottom: 0,
  },
  slide: { width: '100%' },
  slideWide: { maxWidth: 520, alignSelf: 'center' },
  visualWrap: { alignItems: 'center', marginBottom: spacing.lg },
  visualWrapCompact: { marginBottom: spacing.md },
  visualFrame: {
    borderRadius: radius.character,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineBright,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  goalFrame: { gap: 0 },
  scanFrame: {
    padding: 0,
  },
  scanMealWrap: {
    overflow: 'hidden',
    alignSelf: 'center',
    backgroundColor: colors.surface2,
  },
  scanMealDim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(12, 11, 16, 0.28)',
  },
  scanSweepLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.8,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  scanAnalyzingBadge: {
    position: 'absolute',
    top: '38%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(12, 11, 16, 0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineBright,
  },
  scanAnalyzingText: {
    fontFamily: fonts.mono,
    color: colors.text,
  },
  scanCornerTL: {
    position: 'absolute',
    borderColor: colors.accent,
  },
  scanCornerBR: {
    position: 'absolute',
    borderColor: colors.accent,
  },
  scanResultPill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineBright,
  },
  scanResultPillOverlay: {
    position: 'absolute',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 3,
    color: colors.accentSecondary,
  },
  kickerCompact: {
    fontSize: 9,
    letterSpacing: 2.5,
  },
  title: {
    fontFamily: fonts.displayHeavy,
    fontSize: 32,
    lineHeight: 38,
    color: colors.text,
    letterSpacing: -0.8,
    marginTop: spacing.sm,
  },
  titleWide: { fontSize: 36, lineHeight: 42 },
  titleShort: { fontSize: 28, lineHeight: 34 },
  titleCompact: {
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.5,
    marginTop: spacing.xs,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 23,
    color: colors.textSecondary,
    marginTop: spacing.md,
    maxWidth: 400,
  },
  bodyCompact: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.sm,
    maxWidth: 340,
  },
  footer: {
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    backgroundColor: colors.bg,
  },
  footerCompact: {
    gap: spacing.xs,
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
  },
  skipBtn: { alignSelf: 'center', paddingVertical: spacing.sm, minHeight: 44, justifyContent: 'center' },
  skipBtnCompact: { paddingVertical: spacing.xs, minHeight: 36 },
  skipText: {
    ...noTextCaret,
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 0.5,
    color: colors.textTertiary,
  },
});
