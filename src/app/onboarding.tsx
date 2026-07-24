import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { DragonPicker } from '@/components/DragonPicker';
import { GoalEditor } from '@/components/GoalEditor';
import { emptyDragonProgress } from '@/lib/character';
import { trackEvent } from '@/lib/analytics';
import { markNeedsFirstScan } from '@/lib/first-scan';
import { setMealRemindersEnabled } from '@/lib/meal-reminders';
import { todayISODate } from '@/lib/protein';
import { PageCanvas } from '@/components/PageCanvas';
import { useContentColumn, useLayout, usePinnedFooterGap } from '@/lib/layout';
import { useSession } from '@/lib/session';
import type { DragonId, Profile } from '@/lib/types';
import { getPreferredName } from '@/lib/xp';
import { colors, displayLH, fonts, layout, spacing } from '@/theme';

type Step = 'dragon' | 'goal' | 'forging';
type GoalField = 'age' | 'weight' | 'protein' | 'calories';

const FORGE_TASKS = [
  { at: 12, label: 'Analyzing your goal' },
  { at: 48, label: 'Calibrating your XP curve' },
  { at: 82, label: 'Waking your dragon' },
];

/** Approximate Y offsets inside the goal ScrollView for scroll-into-view. */
const FIELD_SCROLL_Y: Record<GoalField, number> = {
  age: 0,
  weight: 90,
  protein: 520,
  calories: 620,
};

/** Fake "building your plan" finale — pure theatre, then routes onward. */
function ForgingScreen({ onDone }: { onDone: () => void }) {
  const [pct, setPct] = useState(0);
  const [name, setName] = useState<string | null>(null);
  const doneRef = useRef(false);
  const barW = useSharedValue(0);

  useEffect(() => {
    getPreferredName().then(setName).catch(() => {});
  }, []);

  useEffect(() => {
    const startedAt = Date.now();
    const DURATION = 3400;
    const timer = setInterval(() => {
      const t = Math.min((Date.now() - startedAt) / DURATION, 1);
      // Ease-out with a believable mid-progress stall.
      const eased = t < 0.7 ? t * 1.1 : 0.77 + (t - 0.7) * 0.77;
      setPct(Math.min(Math.round(eased * 100), 100));
      barW.value = withTiming(Math.min(eased, 1), { duration: 80 });
      if (t >= 1 && !doneRef.current) {
        doneRef.current = true;
        clearInterval(timer);
        setTimeout(onDone, 600);
      }
    }, 50);
    return () => clearInterval(timer);
  }, [onDone, barW]);

  const barStyle = useAnimatedStyle(() => ({ width: `${barW.value * 100}%` }));

  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.forgeRoot}>
      <Text style={styles.forgePct}>{pct}%</Text>
      <Text style={styles.forgeTitle}>
        Building {name ? `${name}'s` : 'your'} protein plan…
      </Text>
      <View style={styles.forgeBarTrack}>
        <Animated.View style={[styles.forgeBarFill, barStyle]} />
      </View>
      <View style={styles.forgeTasks}>
        {FORGE_TASKS.map((task) => {
          const reached = pct >= task.at;
          return (
            <View key={task.label} style={styles.forgeTaskRow}>
              {reached ? (
                <Animated.View entering={FadeIn.duration(250)}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
                </Animated.View>
              ) : (
                <View style={styles.forgeTaskDot} />
              )}
              <Text style={[styles.forgeTaskText, reached && { color: colors.text }]}>
                {task.label}
              </Text>
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
}

/** Two-step progress rail, continuing the intro's visual language. */
function StepProgress({ index }: { index: number }) {
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withSpring((index + 1) / 2, { damping: 18, stiffness: 120 });
  }, [index, w]);
  const style = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View style={styles.stepTrack}>
      <Animated.View style={[styles.stepFill, style]} />
    </View>
  );
}

export default function Onboarding() {
  const { profile, saveProfile } = useSession();
  const { isNarrow, width, height } = useLayout();
  const insets = useSafeAreaInsets();
  const column = useContentColumn('form');
  const isCompact = height < 700 || width < 390;
  const footerGap = usePinnedFooterGap(isCompact);
  const scrollRef = useRef<ScrollView>(null);
  const [step, setStep] = useState<Step>('dragon');
  const [dragonId, setDragonId] = useState<DragonId | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (step !== 'goal') {
      setKeyboardHeight(0);
      return;
    }
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [step]);

  const scrollFieldIntoView = useCallback((field: GoalField) => {
    const bump = () => {
      if (field === 'protein' || field === 'calories') {
        scrollRef.current?.scrollToEnd({ animated: true });
        return;
      }
      const y = Math.max(0, FIELD_SCROLL_Y[field] - 16);
      scrollRef.current?.scrollTo({ y, animated: true });
    };
    requestAnimationFrame(bump);
    // Second pass after keyboard animation settles (esp. Android).
    setTimeout(bump, Platform.OS === 'ios' ? 280 : 120);
  }, []);

  async function handleSubmit(updates: Partial<Profile>) {
    if (!dragonId) {
      setError('Choose a dragon to continue.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const progress = emptyDragonProgress();
      await saveProfile({
        ...updates,
        active_dragon_id: dragonId,
        // Lock the chosen dragon as today's dragon so first-time users land
        // straight on their Today hub instead of being asked to pick again.
        daily_dragon_id: dragonId,
        daily_dragon_date: todayISODate(),
        dragon_progress: { [dragonId]: progress },
        xp: 0,
        streak: 0,
        best_streak: 0,
        goals_hit: 0,
        last_goal_date: null,
        onboarded: true,
      });
      await markNeedsFirstScan();
      trackEvent('onboarding_complete', { dragon_id: dragonId });
      // Meal reminders default ON (opt-out in Settings).
      void setMealRemindersEnabled(true).catch(() => {});
      setStep('forging');
    } catch (e: any) {
      setError(e.message ?? 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (step === 'forging') {
    return (
      <PageCanvas>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <ForgingScreen onDone={() => router.replace('/scan')} />
        </SafeAreaView>
      </PageCanvas>
    );
  }

  function handleDragonPick(id: DragonId) {
    setDragonId(id);
    setError(null);
    setStep('goal');
  }

  // Picking a dragon advances immediately — no Continue button. That removes the
  // extra tap that was failing on small phones / Android release builds.
  if (step === 'dragon') {
    return (
      <PageCanvas>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[
              styles.scroll,
              column,
              { paddingBottom: footerGap + layout.scrollBottomPad },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View style={styles.content}>
              <StepProgress index={0} />
              <DragonPicker value={dragonId} onChange={handleDragonPick} profile={profile} />
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </View>
          </ScrollView>
        </SafeAreaView>
      </PageCanvas>
    );
  }

  const keyboardPad =
    keyboardHeight > 0
      ? Math.max(keyboardHeight - Math.max(insets.bottom, 0) + spacing.md, spacing.xl)
      : 0;

  return (
    <PageCanvas>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? Math.max(insets.top, 8) : 0}>
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={[
              styles.scroll,
              column,
              {
                paddingBottom:
                  footerGap + layout.scrollBottomPad + (Platform.OS === 'android' ? keyboardPad : 0),
              },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            onScrollBeginDrag={Keyboard.dismiss}
            showsVerticalScrollIndicator={false}>
            <View style={styles.content}>
              <Pressable onPress={Keyboard.dismiss} accessibilityRole="none">
                <StepProgress index={1} />
                <Text style={[styles.kicker, isCompact && styles.kickerCompact]}>
                  REACH YOUR POTENTIAL
                </Text>
                <Text style={[styles.step, isCompact && styles.stepCompact]}>
                  STEP 2 · YOUR DAILY TARGET
                </Text>
                <Text
                  style={[
                    styles.title,
                    isNarrow && styles.titleNarrow,
                    isCompact && styles.titleCompact,
                  ]}>
                  Set your daily targets
                </Text>
                <Text style={[styles.subtitle, isCompact && styles.subtitleCompact]}>
                  Protein feeds your dragon. Calories keep the plan honest. Adjust either before you
                  start.
                </Text>
              </Pressable>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <GoalEditor
                profile={null}
                submitLabel="Start tracking"
                saving={saving}
                onSubmit={handleSubmit}
                onFieldFocus={scrollFieldIntoView}
              />
              <Button
                title="Back"
                variant="ghost"
                onPress={() => {
                  Keyboard.dismiss();
                  setStep('dragon');
                }}
                style={{ marginTop: spacing.sm }}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </PageCanvas>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  stepTrack: {
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.ringTrack,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  stepFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  flex: { flex: 1, width: '100%' },
  scroll: { paddingTop: spacing.lg },
  content: { width: '100%', maxWidth: '100%', minWidth: 0 },
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 3.5,
    color: colors.accentSecondary,
  },
  kickerCompact: { letterSpacing: 2.5, fontSize: 8 },
  step: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.accent,
    marginTop: spacing.sm,
  },
  stepCompact: { letterSpacing: 1.2, fontSize: 9 },
  title: {
    fontFamily: fonts.displayHeavy,
    fontSize: 34,
    lineHeight: displayLH(34),
    color: colors.text,
    letterSpacing: -1,
    marginTop: spacing.sm,
  },
  titleNarrow: { fontSize: 28, lineHeight: displayLH(28), letterSpacing: -0.5 },
  titleCompact: { fontSize: 26, lineHeight: displayLH(26) },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  subtitleCompact: { fontSize: 13, lineHeight: 20 },
  error: { fontFamily: fonts.body, fontSize: 13, color: colors.danger, marginTop: spacing.md },
  forgeRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  forgePct: {
    fontFamily: fonts.displayHeavy,
    fontSize: 64,
    lineHeight: displayLH(64),
    color: colors.text,
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
  },
  forgeTitle: {
    fontFamily: fonts.displayMedium,
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  forgeBarTrack: {
    width: '100%',
    maxWidth: 320,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.ringTrack,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  forgeBarFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  forgeTasks: {
    gap: spacing.md,
    marginTop: spacing.xl,
    alignSelf: 'center',
  },
  forgeTaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 220,
  },
  forgeTaskDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.hairlineBright,
  },
  forgeTaskText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textTertiary,
  },
});
