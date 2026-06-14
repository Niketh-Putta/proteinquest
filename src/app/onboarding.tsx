import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { DragonPicker } from '@/components/DragonPicker';
import { GoalEditor } from '@/components/GoalEditor';
import { emptyDragonProgress } from '@/lib/character';
import { todayISODate } from '@/lib/protein';
import { useLayout, usePinnedFooterGap } from '@/lib/layout';
import { useSession } from '@/lib/session';
import type { DragonId, Profile } from '@/lib/types';
import { getPreferredName } from '@/lib/xp';
import { colors, fonts, spacing } from '@/theme';

type Step = 'dragon' | 'goal' | 'forging';

const FORGE_TASKS = [
  { at: 12, label: 'Analyzing your goal' },
  { at: 48, label: 'Calibrating your XP curve' },
  { at: 82, label: 'Waking your dragon' },
];

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
  const { saveProfile } = useSession();
  const { horizontalPad, contentMaxWidth, isNarrow, width, height } = useLayout();
  const isCompact = height < 700 || width < 390;
  const footerGap = usePinnedFooterGap(isCompact);
  const [step, setStep] = useState<Step>('dragon');
  const [dragonId, setDragonId] = useState<DragonId | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setStep('forging');
    } catch (e: any) {
      setError(e.message ?? 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (step === 'forging') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ForgingScreen onDone={() => router.replace('/')} />
      </SafeAreaView>
    );
  }

  function handleDragonPick(id: DragonId) {
    setDragonId(id);
    setError(null);
    setStep('goal');
  }

  // Centered content column for the scroll body.
  const columnStyle = {
    width: '100%' as const,
    maxWidth: contentMaxWidth,
    alignSelf: 'center' as const,
    paddingHorizontal: horizontalPad,
  };

  // Picking a dragon advances immediately — no Continue button. That removes the
  // extra tap that was failing on small phones / Android release builds.
  if (step === 'dragon') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scroll, columnStyle, { paddingBottom: footerGap }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <StepProgress index={0} />
            <DragonPicker value={dragonId} onChange={handleDragonPick} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scroll, columnStyle, { paddingBottom: footerGap }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
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
              Set your protein goal
            </Text>
            <Text style={[styles.subtitle, isCompact && styles.subtitleCompact]}>
              Hit it every day to feed your dragon and unlock evolutions. Small wins compound.
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <GoalEditor
              profile={null}
              submitLabel="Start tracking"
              saving={saving}
              onSubmit={handleSubmit}
            />
            <Button
              title="Back"
              variant="ghost"
              onPress={() => setStep('dragon')}
              style={{ marginTop: spacing.sm }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
    lineHeight: 40,
    color: colors.text,
    letterSpacing: -1,
    marginTop: spacing.sm,
  },
  titleNarrow: { fontSize: 28, lineHeight: 34, letterSpacing: -0.5 },
  titleCompact: { fontSize: 26, lineHeight: 32 },
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
