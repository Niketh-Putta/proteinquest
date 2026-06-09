import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ChoiceRow, FieldLabel, NumberField, SegmentedRow } from '@/components/forms';
import {
  ACTIVITY_LABELS,
  GOAL_LABELS,
  calculateProteinGoal,
} from '@/lib/protein';
import { useSession } from '@/lib/session';
import type { ActivityLevel, GoalType, Sex } from '@/lib/types';
import { colors, fonts, spacing } from '@/theme';

export default function Onboarding() {
  const { saveProfile } = useSession();
  const [age, setAge] = useState('');
  const [weight, setWeight] = useState('');
  const [sex, setSex] = useState<Sex | null>(null);
  const [activity, setActivity] = useState<ActivityLevel | null>(null);
  const [goalType, setGoalType] = useState<GoalType | null>(null);
  const [saving, setSaving] = useState(false);

  const goal = useMemo(() => {
    const a = parseInt(age, 10);
    const w = parseFloat(weight);
    if (!a || !w || !activity || !goalType) return null;
    return calculateProteinGoal({ age: a, weightKg: w, activityLevel: activity, goalType });
  }, [age, weight, activity, goalType]);

  async function handleStart() {
    if (!goal) return;
    setSaving(true);
    try {
      await saveProfile({
        age: parseInt(age, 10),
        weight_kg: parseFloat(weight),
        sex,
        activity_level: activity,
        goal_type: goalType,
        protein_goal_g: goal,
        onboarded: true,
      });
      router.replace('/(tabs)/today');
    } catch (e: any) {
      Alert.alert('Could not save', e.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled">
          <Text style={styles.kicker}>PROTEINLENS</Text>
          <Text style={styles.title}>Let&apos;s set your{'\n'}protein goal.</Text>
          <Text style={styles.subtitle}>
            Answer four quick questions. We&apos;ll calculate exactly how much protein
            you need every day.
          </Text>

          <FieldLabel>Age</FieldLabel>
          <NumberField value={age} onChange={setAge} placeholder="25" suffix="years" />

          <FieldLabel>Weight</FieldLabel>
          <NumberField value={weight} onChange={setWeight} placeholder="75" suffix="kg" />

          <FieldLabel>Sex</FieldLabel>
          <SegmentedRow
            value={sex}
            onChange={setSex}
            options={[
              { value: 'male', title: 'Male' },
              { value: 'female', title: 'Female' },
            ]}
          />

          <FieldLabel>How often do you train?</FieldLabel>
          <ChoiceRow
            value={activity}
            onChange={setActivity}
            options={(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((k) => ({
              value: k,
              title: ACTIVITY_LABELS[k].title,
              subtitle: ACTIVITY_LABELS[k].subtitle,
            }))}
          />

          <FieldLabel>What&apos;s your goal?</FieldLabel>
          <ChoiceRow
            value={goalType}
            onChange={setGoalType}
            options={(Object.keys(GOAL_LABELS) as GoalType[]).map((k) => ({
              value: k,
              title: GOAL_LABELS[k].title,
              subtitle: GOAL_LABELS[k].subtitle,
            }))}
          />

          {goal ? (
            <View style={styles.goalCard}>
              <Text style={styles.goalLabel}>Your daily protein target</Text>
              <Text style={styles.goalValue}>
                {goal}
                <Text style={styles.goalUnit}>g</Text>
              </Text>
            </View>
          ) : null}

          <Button
            title="Start tracking"
            onPress={handleStart}
            disabled={!goal}
            loading={saving}
            style={{ marginTop: spacing.lg }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  kicker: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2.5,
    color: colors.accent,
    marginTop: spacing.md,
  },
  title: {
    fontSize: 36,
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
  goalCard: {
    marginTop: spacing.xl,
    backgroundColor: '#15180F',
    borderWidth: 1,
    borderColor: colors.accentDark,
    borderRadius: 20,
    padding: spacing.lg,
    alignItems: 'center',
  },
  goalLabel: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  goalValue: {
    fontSize: 56,
    fontWeight: '800',
    color: colors.accent,
    fontFamily: fonts?.rounded,
    fontVariant: ['tabular-nums'],
  },
  goalUnit: { fontSize: 28, color: colors.accentDark },
});
