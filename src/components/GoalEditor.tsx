import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button } from '@/components/Button';
import { ChoiceRow, FieldLabel, NumberField, SegmentedRow } from '@/components/forms';
import {
  ACTIVITY_LABELS,
  GOAL_LABELS,
  calculateProteinGoal,
  kgFromInput,
} from '@/lib/protein';
import type { ActivityLevel, GoalType, Profile, Sex } from '@/lib/types';
import { colors, fonts, radius, spacing, type } from '@/theme';

interface Props {
  profile: Profile | null;
  submitLabel: string;
  saving: boolean;
  onSubmit: (updates: Partial<Profile>) => void;
}

export function GoalEditor({ profile, submitLabel, saving, onSubmit }: Props) {
  const initialUnit = profile?.weight_unit ?? 'kg';
  const [age, setAge] = useState(profile?.age ? String(profile.age) : '');
  const [unit, setUnit] = useState<'kg' | 'lbs'>(initialUnit);
  const [weight, setWeight] = useState(() => {
    if (!profile?.weight_kg) return '';
    const v = initialUnit === 'kg' ? profile.weight_kg : profile.weight_kg / 0.45359237;
    return String(Math.round(v * 10) / 10);
  });
  const [sex, setSex] = useState<Sex | null>(profile?.sex ?? null);
  const [activity, setActivity] = useState<ActivityLevel | null>(profile?.activity_level ?? null);
  const [goalType, setGoalType] = useState<GoalType | null>(profile?.goal_type ?? null);

  const calc = useMemo(() => {
    const a = parseInt(age, 10);
    const w = parseFloat(weight);
    if (!a || !w || !activity || !goalType) return null;
    return calculateProteinGoal({
      weightKg: kgFromInput(w, unit),
      age: a,
      sex,
      activityLevel: activity,
      goalType,
    });
  }, [age, weight, unit, sex, activity, goalType]);

  function handleSubmit() {
    if (!calc) return;
    onSubmit({
      age: parseInt(age, 10),
      weight_kg: Math.round(kgFromInput(parseFloat(weight), unit) * 10) / 10,
      weight_unit: unit,
      sex,
      activity_level: activity,
      goal_type: goalType,
      protein_goal_g: calc.grams,
      onboarded: true,
    });
  }

  return (
    <View>
      <FieldLabel>Age</FieldLabel>
      <NumberField value={age} onChange={setAge} placeholder="25" suffix="YRS" />

      <FieldLabel>Weight</FieldLabel>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <NumberField
            value={weight}
            onChange={setWeight}
            placeholder={unit === 'kg' ? '75' : '165'}
            suffix={unit.toUpperCase()}
          />
        </View>
        <View style={{ width: 130 }}>
          <SegmentedRow
            value={unit}
            onChange={setUnit}
            options={[
              { value: 'kg', title: 'kg' },
              { value: 'lbs', title: 'lbs' },
            ]}
          />
        </View>
      </View>

      <FieldLabel>Sex</FieldLabel>
      <SegmentedRow
        value={sex}
        onChange={setSex}
        options={[
          { value: 'male', title: 'Male' },
          { value: 'female', title: 'Female' },
        ]}
      />

      <FieldLabel>Training</FieldLabel>
      <ChoiceRow
        value={activity}
        onChange={setActivity}
        options={(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((k) => ({
          value: k,
          title: ACTIVITY_LABELS[k].title,
          subtitle: ACTIVITY_LABELS[k].subtitle,
        }))}
      />

      <FieldLabel>Goal</FieldLabel>
      <ChoiceRow
        value={goalType}
        onChange={setGoalType}
        options={(Object.keys(GOAL_LABELS) as GoalType[]).map((k) => ({
          value: k,
          title: GOAL_LABELS[k].title,
          subtitle: GOAL_LABELS[k].subtitle,
        }))}
      />

      {calc ? (
        <Animated.View entering={FadeInDown.springify().damping(16)} style={styles.goalCard}>
          <Text style={styles.goalLabel}>YOUR DAILY TARGET</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={styles.goalValue}>{calc.grams}</Text>
            <Text style={styles.goalUnit}>g</Text>
          </View>
          <View style={styles.gPerKgPill}>
            <Text style={styles.gPerKgText}>{calc.gPerKg} g per kg bodyweight</Text>
          </View>
          <View style={styles.reasoning}>
            {calc.reasoning.map((line, i) => (
              <View key={i} style={styles.reasonRow}>
                <View style={styles.reasonDot} />
                <Text style={styles.reasonText}>{line}</Text>
              </View>
            ))}
          </View>
        </Animated.View>
      ) : null}

      <Button
        title={submitLabel}
        onPress={handleSubmit}
        disabled={!calc}
        loading={saving}
        style={{ marginTop: spacing.lg }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  goalCard: {
    marginTop: spacing.xl,
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.accentDeep,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  goalLabel: { ...type.label, color: colors.textSecondary },
  goalValue: {
    fontSize: 64,
    lineHeight: 70,
    fontFamily: fonts.displayHeavy,
    color: colors.accent,
    fontVariant: ['tabular-nums'],
  },
  goalUnit: { fontSize: 28, fontFamily: fonts.display, color: colors.accentDeep },
  gPerKgPill: {
    backgroundColor: colors.surface2,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.full,
    marginTop: 6,
  },
  gPerKgText: { fontFamily: fonts.monoBold, fontSize: 11, color: colors.text, letterSpacing: 0.4 },
  reasoning: { alignSelf: 'stretch', marginTop: spacing.md, gap: 8 },
  reasonRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  reasonDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginTop: 6,
  },
  reasonText: { flex: 1, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, color: colors.textSecondary },
});
