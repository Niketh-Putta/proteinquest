import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button } from '@/components/Button';
import { ChoiceRow, FieldLabel, NumberField, SegmentedRow } from '@/components/forms';
import { useLayout } from '@/lib/layout';
import {
  ACTIVITY_LABELS,
  GOAL_LABELS,
  calculateProteinGoal,
  kgFromInput,
} from '@/lib/protein';
import type { ActivityLevel, GoalType, Profile, Sex } from '@/lib/types';
import { colors, fonts, spacing, type } from '@/theme';

interface Props {
  profile: Profile | null;
  submitLabel: string;
  saving: boolean;
  onSubmit: (updates: Partial<Profile>) => void;
}

export function GoalEditor({ profile, submitLabel, saving, onSubmit }: Props) {
  const { isNarrow } = useLayout();
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
    <View style={styles.root}>
      <FieldLabel>Age</FieldLabel>
      <NumberField value={age} onChange={setAge} placeholder="25" suffix="YRS" />

      <FieldLabel>Weight</FieldLabel>
      {isNarrow ? (
        <View style={styles.weightStack}>
          <NumberField
            value={weight}
            onChange={setWeight}
            placeholder={unit === 'kg' ? '75' : '165'}
          />
          <SegmentedRow
            value={unit}
            onChange={setUnit}
            options={[
              { value: 'kg', title: 'kg' },
              { value: 'lbs', title: 'lbs' },
            ]}
          />
        </View>
      ) : (
        <View style={styles.weightRow}>
          <View style={styles.weightInput}>
            <NumberField
              value={weight}
              onChange={setWeight}
              placeholder={unit === 'kg' ? '75' : '165'}
            />
          </View>
          <View style={styles.unitPicker}>
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
      )}

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
        <Animated.View entering={FadeInDown.springify().damping(16)} style={styles.goalBlock}>
          <Text style={styles.goalLabel}>YOUR DAILY TARGET</Text>
          <View style={styles.goalRow}>
            <Text style={[styles.goalValue, isNarrow && styles.goalValueNarrow]}>
              {calc.grams}
            </Text>
            <Text style={[styles.goalUnit, isNarrow && styles.goalUnitNarrow]}>g</Text>
          </View>
          <Text style={styles.gPerKg}>{calc.gPerKg} g per kg bodyweight</Text>
          <View style={styles.rule} />
          <View style={styles.reasoning}>
            {calc.reasoning.map((line, i) => (
              <View key={i} style={styles.reasonRow}>
                <Text style={styles.reasonDash}>-</Text>
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
        style={{ marginTop: spacing.xl }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%', maxWidth: '100%' },
  weightStack: { gap: spacing.sm, marginBottom: spacing.xs },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    width: '100%',
    maxWidth: '100%',
  },
  weightInput: { flex: 1, minWidth: 0 },
  unitPicker: { flexShrink: 0, width: '36%', maxWidth: 120, minWidth: 96 },
  goalBlock: { marginTop: spacing.xl, paddingVertical: spacing.lg },
  goalLabel: { ...type.label, color: colors.textTertiary },
  goalRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginTop: 4 },
  goalValue: {
    fontSize: 64,
    lineHeight: 64,
    fontFamily: fonts.displayHeavy,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: -2,
  },
  goalValueNarrow: {
    fontSize: 52,
    lineHeight: 52,
    letterSpacing: -1.5,
  },
  goalUnit: {
    fontSize: 24,
    fontFamily: fonts.display,
    color: colors.textTertiary,
    marginBottom: 8,
  },
  goalUnitNarrow: { fontSize: 20, marginBottom: 6 },
  gPerKg: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.accent,
    letterSpacing: 0.4,
    marginTop: 6,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairlineBright,
    marginVertical: spacing.lg,
  },
  reasoning: { gap: 10 },
  reasonRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  reasonDash: { fontFamily: fonts.mono, fontSize: 12, color: colors.textTertiary, flexShrink: 0 },
  reasonText: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
});
