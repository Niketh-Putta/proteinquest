import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { DragonPicker } from '@/components/DragonPicker';
import { GoalEditor } from '@/components/GoalEditor';
import { emptyDragonProgress } from '@/lib/character';
import { useLayout, usePinnedFooterGap } from '@/lib/layout';
import { useSession } from '@/lib/session';
import type { DragonId, Profile } from '@/lib/types';
import { colors, fonts, spacing } from '@/theme';

type Step = 'dragon' | 'goal';

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
        dragon_progress: { [dragonId]: progress },
        xp: 0,
        streak: 0,
        best_streak: 0,
        goals_hit: 0,
        last_goal_date: null,
        onboarded: true,
      });
      router.replace('/(tabs)/today');
    } catch (e: any) {
      setError(e.message ?? 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.scroll,
            {
              paddingHorizontal: horizontalPad,
              maxWidth: contentMaxWidth,
              width: '100%',
              alignSelf: 'center',
              paddingBottom: footerGap,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            {step === 'dragon' ? (
              <Animated.View entering={FadeInDown.springify().damping(16)}>
                <DragonPicker value={dragonId} onChange={setDragonId} />
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Button
                  title="Continue"
                  onPress={() => {
                    if (!dragonId) {
                      setError('Choose a dragon to continue.');
                      return;
                    }
                    setError(null);
                    setStep('goal');
                  }}
                  disabled={!dragonId}
                  style={{ marginTop: spacing.xl }}
                />
              </Animated.View>
            ) : (
              <Animated.View entering={FadeInDown.springify().damping(16)}>
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
              </Animated.View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
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
});
