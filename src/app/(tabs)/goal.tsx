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

export default function GoalScreen() {
  const { profile, saveProfile } = useSession();
  const [age, setAge] = useState(profile?.age ? String(profile.age) : '');
  const [weight, setWeight] = useState(profile?.weight_kg ? String(profile.weight_kg) : '');
  const [sex, setSex] = useState<Sex | null>(profile?.sex ?? null);
  const [activity, setActivity] = useState<ActivityLevel | null>(profile?.activity_level ?? null);
  const [goalType, setGoalType] = useState<GoalType | null>(profile?.goal_type ?? null);
  const [saving, setSaving] = useState(false);

  const goal = useMemo(() => {
    const a = parseInt(age, 10);
    const w = parseFloat(weight);
    if (!a || !w || !activity || !goalType) return null;
    return calculateProteinGoal({ age: a, weightKg: w, activityLevel: activity, goalType });
  }, [age, weight, activity, goalType]);

  async function handleSave() {
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
      Alert.alert('Saved', `Your daily goal is now ${goal}g of protein.`);
    } catch (e: any) {
      Alert.alert('Could not save', e.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Your goal</Text>

          <View style={styles.goalCard}>
            <Text style={styles.goalLabel}>Current daily target</Text>
            <Text style={styles.goalValue}>
              {goal ?? profile?.protein_goal_g ?? '--'}
              <Text style={styles.goalUnit}>g</Text>
            </Text>
          </View>

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

          <Button
            title="Update goal"
            onPress={handleSave}
            disabled={!goal}
            loading={saving}
            style={{ marginTop: spacing.xl }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.text,
    fontFamily: fonts?.rounded,
  },
  goalCard: {
    marginTop: spacing.md,
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
