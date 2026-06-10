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
import { useLayout } from '@/lib/layout';
import { useSession } from '@/lib/session';
import type { DragonId, Profile } from '@/lib/types';
import { colors, fonts, spacing, type } from '@/theme';

type Step = 'dragon' | 'goal';

export default function Onboarding() {
  const { saveProfile } = useSession();
  const { contentWidth, horizontalPad, isNarrow } = useLayout();
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
        style={{ flex: 1, alignItems: 'center' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingHorizontal: horizontalPad, width: contentWidth, maxWidth: 428, alignSelf: 'center' },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
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
                style={{ marginTop: spacing.lg }}
              />
            </Animated.View>
          ) : (
            <Animated.View entering={FadeInDown.springify().damping(16)}>
              <Text style={styles.kicker}>STEP 2 OF 2</Text>
              <Text style={[styles.title, isNarrow && { fontSize: 32, lineHeight: 38 }]}>
                Your protein target.
              </Text>
              <Text style={styles.subtitle}>
                Feed {dragonId} every day by hitting this number.
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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: spacing.xxl, paddingTop: spacing.md },
  kicker: { ...type.label, color: colors.accent },
  title: {
    fontFamily: fonts.displayHeavy,
    fontSize: 36,
    lineHeight: 42,
    color: colors.text,
    marginTop: spacing.sm,
  },
  subtitle: { ...type.body, marginTop: spacing.sm, marginBottom: spacing.md },
  error: { fontFamily: fonts.body, fontSize: 13, color: colors.danger, marginTop: spacing.md },
});
