import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ChoiceRow, FieldLabel, NumberField, SegmentedRow } from '@/components/forms';
import { useLayout } from '@/lib/layout';
import {
  ACTIVITY_LABELS,
  AGE_MAX,
  AGE_MIN,
  CALORIE_AIM_MAX,
  CALORIE_AIM_MIN,
  GOAL_LABELS,
  KG_PER_LB,
  WEIGHT_KG_MAX,
  WEIGHT_KG_MIN,
  calculateCalorieAim,
  calculateProteinGoal,
  kgFromInput,
} from '@/lib/protein';
import { nutritionEstimate } from '@/lib/nutrition-estimate';
import { getRetention } from '@/lib/retention';
import type { ActivityLevel, GoalType, Profile, Sex } from '@/lib/types';
import {
  colors,
  displayLH,
  fonts,
  layout,
  noTextCaret,
  pressableWeb,
  shadowAccent,
  spacing,
  textInputWeb,
  type,
} from '@/theme';

const PROTEIN_MIN = 45;
const PROTEIN_MAX = 250;

interface Props {
  profile: Profile | null;
  extended?: boolean;
  submitLabel: string;
  saving: boolean;
  onSubmit: (updates: Partial<Profile>) => void;
  /** Scroll focused fields above the keyboard (owned by parent ScrollView). */
  onFieldFocus?: (field: 'age' | 'weight' | 'protein' | 'calories') => void;
}

export function GoalEditor({ profile, extended = false, submitLabel, saving, onSubmit, onFieldFocus }: Props) {
  const { isNarrow } = useLayout();
  const details = getRetention(profile).onboarding ?? {};
  const [height, setHeight] = useState(String(details.height ?? ''));
  const [target, setTarget] = useState(String(details.target ?? profile?.weight_kg ?? ''));
  const [pace, setPace] = useState(String(details.pace ?? 0.25));
  const [motivation, setMotivation] = useState(String(details.motivation ?? ''));
  const [obstacles, setObstacles] = useState(String(details.obstacles ?? ''));
  const [trainer, setTrainer] = useState(String(details.trainer ?? 'No'));
  const [diet, setDiet] = useState(String(details.diet ?? 'Balanced'));
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
  const [proteinText, setProteinText] = useState(() =>
    profile?.protein_goal_g != null ? String(Math.round(profile.protein_goal_g)) : '',
  );
  const [calorieText, setCalorieText] = useState(() => {
    const stored = getRetention(profile).calorie_goal_kcal;
    return typeof stored === 'number' && Number.isFinite(stored) ? String(Math.round(stored)) : '';
  });
  const [proteinDirty, setProteinDirty] = useState(
    () => profile?.protein_goal_g != null,
  );
  const [calorieDirty, setCalorieDirty] = useState(() => {
    const stored = getRetention(profile).calorie_goal_kcal;
    return typeof stored === 'number' && Number.isFinite(stored);
  });

  const ageNum = parseInt(age, 10);
  const weightNum = parseFloat(weight);
  const weightKg = Number.isFinite(weightNum) ? kgFromInput(weightNum, unit) : NaN;

  const changeUnit = (next: 'kg' | 'lbs') => {
    if (next === unit) return;
    if (Number.isFinite(weightKg)) setWeight(String(Math.round((next === 'kg' ? weightKg : weightKg / KG_PER_LB) * 10) / 10));
    setUnit(next);
  };
  useEffect(() => { setProteinDirty(false); setCalorieDirty(false); },
    [age, weight, sex, activity, goalType, height, target, pace]);
  let personalized: ReturnType<typeof nutritionEstimate> | null = null;
  let detailsError: string | null = null;
  if (extended) {
    try {
      personalized = nutritionEstimate({ age: ageNum, heightCm: Number(height), weightKg,
        targetKg: goalType === 'maintain' ? weightKg : Number(target), sex: sex ?? '',
        activity: activity ?? '', goal: goalType ?? '', pace: Number(pace) });
      if ((goalType === 'lose_fat' && Number(target) > weightKg) ||
          (goalType === 'build_muscle' && Number(target) < weightKg))
        detailsError = 'Choose a target weight that matches your goal.';
    } catch (e) { detailsError = e instanceof Error ? e.message : 'Check your details.'; }
  }

  // Mirror the profiles table check constraints so invalid values never reach the DB.
  const ageValid = Number.isFinite(ageNum) && ageNum >= AGE_MIN && ageNum <= AGE_MAX;
  const weightValid =
    Number.isFinite(weightKg) && weightKg >= WEIGHT_KG_MIN && weightKg <= WEIGHT_KG_MAX;

  const ageError =
    age !== '' && Number.isFinite(ageNum) && !ageValid
      ? `Enter an age between ${AGE_MIN} and ${AGE_MAX}.`
      : null;
  const weightError =
    weight !== '' && Number.isFinite(weightKg) && !weightValid
      ? unit === 'kg'
        ? `Enter a weight between ${WEIGHT_KG_MIN} and ${WEIGHT_KG_MAX} kg.`
        : `Enter a weight between ${Math.ceil(WEIGHT_KG_MIN / KG_PER_LB)} and ${Math.floor(WEIGHT_KG_MAX / KG_PER_LB)} lbs.`
      : null;

  const calc = useMemo(() => {
    if (!ageValid || !weightValid || !activity || !goalType) return null;
    return calculateProteinGoal({
      weightKg,
      age: ageNum,
      sex,
      activityLevel: activity,
      goalType,
    });
  }, [ageValid, weightValid, weightKg, ageNum, sex, activity, goalType]);

  const calorieCalc = useMemo(() => {
    if (!weightValid || !activity || !goalType) return null;
    return calculateCalorieAim({
      weightKg,
      sex,
      activityLevel: activity,
      goalType,
    });
  }, [weightValid, weightKg, sex, activity, goalType]);

  const suggestedCalories = personalized?.calories ?? calorieCalc?.kcal ?? null;
  const suggestedProtein = personalized?.protein ?? calc?.grams;

  useEffect(() => {
    if (!calc || proteinDirty) return;
    setProteinText(String(suggestedProtein));
  }, [calc, suggestedProtein, proteinDirty]);

  useEffect(() => {
    if (suggestedCalories == null || calorieDirty) return;
    setCalorieText(String(suggestedCalories));
  }, [suggestedCalories, calorieDirty]);

  const proteinNum = parseInt(proteinText, 10);
  const calorieNum = parseInt(calorieText, 10);
  const proteinValid =
    Number.isFinite(proteinNum) && proteinNum >= PROTEIN_MIN && proteinNum <= PROTEIN_MAX;
  const calorieValid =
    Number.isFinite(calorieNum) &&
    calorieNum >= CALORIE_AIM_MIN &&
    calorieNum <= CALORIE_AIM_MAX;
  const canSubmit =
    !!calc && ageValid && weightValid && proteinValid && calorieValid && !detailsError;

  function handleSubmit() {
    if (!canSubmit || !calc) return;
    const retention = {
      ...getRetention(profile),
      calorie_goal_kcal: calorieNum,
      ...(extended ? { onboarding: { ...details, age: ageNum, birthday: ageNum === profile?.age ? details.birthday ?? '' : '', height: height === '' ? '' : Number(height),
        weight: Math.round(weightKg * 10) / 10, target: goalType === 'maintain' ? weightKg : Number(target),
        pace: Number(pace), diet, motivation, obstacles, trainer, sex: sex === 'male' ? 'Male' : sex === 'female' ? 'Female' : 'Other',
        goal: goalType === 'lose_fat' ? 'Lose weight' : goalType === 'build_muscle' ? 'Gain weight' : 'Maintain',
        activity: activity ?? '', weightUnit: unit } } : {}),
    };
    onSubmit({
      age: ageNum,
      weight_kg: Math.round(weightKg * 10) / 10,
      weight_unit: unit,
      sex,
      activity_level: activity,
      goal_type: goalType,
      protein_goal_g: proteinNum,
      retention,
      onboarded: true,
    });
  }

  const proteinHint =
    proteinValid && weightValid
      ? `${(proteinNum / weightKg).toFixed(1)} g per kg bodyweight`
      : calc
        ? `${calc.gPerKg} g per kg suggested`
        : 'g per kg bodyweight';

  const showProteinReset =
    !!calc && proteinDirty && proteinValid && proteinNum !== suggestedProtein;
  const showCalorieReset =
    calorieDirty &&
    calorieValid &&
    suggestedCalories != null &&
    calorieNum !== suggestedCalories;

  return (
    <View style={styles.root}>
      <FieldLabel>Age</FieldLabel>
      <NumberField
        value={age}
        onChange={setAge}
        placeholder="25"
        suffix="YRS"
        keyboardType="number-pad"
        onFocus={() => onFieldFocus?.('age')}
      />
      {ageError ? <Text style={styles.fieldError}>{ageError}</Text> : null}

      <FieldLabel>Weight</FieldLabel>
      {isNarrow ? (
        <View style={styles.weightStack}>
          <NumberField
            value={weight}
            onChange={setWeight}
            placeholder={unit === 'kg' ? '75' : '165'}
            keyboardType="decimal-pad"
            onFocus={() => onFieldFocus?.('weight')}
          />
          <SegmentedRow
            value={unit}
            onChange={changeUnit}
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
              keyboardType="decimal-pad"
              onFocus={() => onFieldFocus?.('weight')}
            />
          </View>
          <View style={styles.unitPicker}>
            <SegmentedRow
              value={unit}
              onChange={changeUnit}
              options={[
                { value: 'kg', title: 'kg' },
                { value: 'lbs', title: 'lbs' },
              ]}
            />
          </View>
        </View>
      )}
      {weightError ? <Text style={styles.fieldError}>{weightError}</Text> : null}

      {extended && <>
      <FieldLabel>Height (cm)</FieldLabel>
      <NumberField value={height} onChange={setHeight} placeholder="170" keyboardType="decimal-pad" />
      <FieldLabel>Target weight (kg)</FieldLabel>
      <NumberField value={target} onChange={setTarget} placeholder="70" keyboardType="decimal-pad" />
      <FieldLabel>Weekly pace (kg)</FieldLabel>
      <NumberField value={pace} onChange={setPace} placeholder="0.25" keyboardType="decimal-pad" />
      <FieldLabel>Diet preference</FieldLabel>
      <ChoiceRow value={diet} onChange={setDiet} options={['Balanced','Vegetarian','Vegan','Pescatarian','Other'].map(value => ({value,title:value}))} />
      <FieldLabel>Motivation</FieldLabel>
      <TextInput value={motivation} onChangeText={setMotivation} placeholder="What keeps you going?" placeholderTextColor={colors.textTertiary} style={[styles.reasonText, {paddingVertical:12}]} />
      <FieldLabel>What gets in the way?</FieldLabel>
      <TextInput value={obstacles} onChangeText={setObstacles} placeholder="Your biggest challenge" placeholderTextColor={colors.textTertiary} style={[styles.reasonText, {paddingVertical:12}]} />
      <FieldLabel>Working with a trainer?</FieldLabel>
      <SegmentedRow value={trainer} onChange={setTrainer} options={[{value:'Yes',title:'Yes'},{value:'No',title:'No'}]} />
      {detailsError ? <Text style={styles.fieldError}>{detailsError}</Text> : null}
      <Text style={styles.reasonText}>Targets are starting estimates. Adjust with your progress. Diet preferences do not change your energy requirement.</Text>
      </>}
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

      {calc && calorieCalc ? (
        <Animated.View entering={FadeInDown.duration(360)} style={styles.goalBlock}>
          <Text style={styles.goalLabel}>YOUR DAILY TARGET</Text>
          <View style={styles.goalRow}>
            <TextInput
              value={proteinText}
              onChangeText={(t) => {
                setProteinDirty(true);
                setProteinText(t.replace(/[^0-9]/g, ''));
              }}
              keyboardType="number-pad"
              maxLength={3}
              selectTextOnFocus
              accessibilityLabel="Protein goal in grams"
              onFocus={() => onFieldFocus?.('protein')}
              style={[
                styles.goalValue,
                isNarrow && styles.goalValueNarrow,
                textInputWeb,
              ]}
            />
            <Text style={[styles.goalUnit, isNarrow && styles.goalUnitNarrow]}>g</Text>
          </View>
          <Text style={styles.gPerKg}>{proteinHint}</Text>

          <View style={styles.calorieRow}>
            <Text style={[styles.calorieTilde, isNarrow && styles.calorieTildeNarrow]}>~</Text>
            <TextInput
              value={calorieText}
              onChangeText={(t) => {
                setCalorieDirty(true);
                setCalorieText(t.replace(/[^0-9]/g, ''));
              }}
              keyboardType="number-pad"
              maxLength={4}
              selectTextOnFocus
              accessibilityLabel="Calorie aim in kcal"
              onFocus={() => onFieldFocus?.('calories')}
              style={[
                styles.calorieValue,
                isNarrow && styles.calorieValueNarrow,
                textInputWeb,
              ]}
            />
            <Text style={[styles.calorieUnit, isNarrow && styles.calorieUnitNarrow]}>
              kcal aim
            </Text>
          </View>

          {(showProteinReset || showCalorieReset) && (
            <View style={styles.resetRow}>
              {showProteinReset ? (
                <Pressable
                  onPress={() => {
                    setProteinDirty(false);
                    setProteinText(String(suggestedProtein));
                  }}
                  style={({ pressed }) => [
                    styles.suggestChip,
                    pressableWeb,
                    Platform.OS === 'web' ? webGlassBlur : null,
                    pressed && { opacity: 0.75 },
                  ]}>
                  <View pointerEvents="none" style={styles.suggestSheen} />
                  <Text style={styles.suggestChipText}>Use suggested {suggestedProtein}g</Text>
                </Pressable>
              ) : null}
              {showCalorieReset ? (
                <Pressable
                  onPress={() => {
                    setCalorieDirty(false);
                    setCalorieText(String(suggestedCalories));
                  }}
                  style={({ pressed }) => [
                    styles.suggestChip,
                    pressableWeb,
                    Platform.OS === 'web' ? webGlassBlur : null,
                    pressed && { opacity: 0.75 },
                  ]}>
                  <View pointerEvents="none" style={styles.suggestSheen} />
                  <Text style={styles.suggestChipText}>
                    Use suggested {suggestedCalories} kcal
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}

          <View style={styles.rule} />
          <Text style={styles.breakdownLabel}>HOW WE GOT HERE</Text>
          <View style={styles.reasoning}>
            {(personalized ? ['Protein based on bodyweight, training and goal.'] : calc.reasoning).map((line, i) => (
              <View key={`p-${i}`} style={styles.reasonRow}>
                <Text style={styles.reasonDash}>-</Text>
                <Text style={styles.reasonText}>{line}</Text>
              </View>
            ))}
            {(personalized ? ['Calories use age, sex, height, weight, activity and a bounded goal adjustment. Maintenance applies once your target is reached.'] : calorieCalc.reasoning).map((line, i) => (
              <View key={`c-${i}`} style={styles.reasonRow}>
                <Text style={styles.reasonDash}>-</Text>
                <Text style={styles.reasonText}>{line}</Text>
              </View>
            ))}
          </View>
        </Animated.View>
      ) : null}

      <View
        style={[
          styles.ctaGlow,
          (!canSubmit || saving) && styles.ctaGlowDisabled,
        ]}>
        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit || saving}
          hitSlop={10}
          pressRetentionOffset={{ top: 24, bottom: 24, left: 24, right: 24 }}
          android_ripple={{ color: 'rgba(0,0,0,0.16)', borderless: false }}
          accessibilityRole="button"
          accessibilityLabel={submitLabel}
          accessibilityState={{ disabled: !canSubmit || saving, busy: saving }}
          style={({ pressed }) => [
            styles.ctaPressable,
            pressableWeb,
            pressed && canSubmit && !saving && styles.ctaPressed,
          ]}>
          <LinearGradient
            colors={
              canSubmit && !saving
                ? [colors.accentLight, colors.accent, colors.accentDeep]
                : [colors.accentDeep, '#8A3A2C']
            }
            locations={[0, 0.48, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.ctaInner}>
            <View pointerEvents="none" style={styles.ctaSheen} />
            {saving ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <>
                <Text
                  selectable={false}
                  style={[
                    styles.ctaLabel,
                    noTextCaret,
                    !canSubmit && styles.ctaLabelDisabled,
                  ]}>
                  {submitLabel}
                </Text>
                {canSubmit ? (
                  <Ionicons name="arrow-forward" size={18} color={colors.onAccent} />
                ) : null}
              </>
            )}
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const webGlassBlur =
  Platform.OS === 'web'
    ? ({
        backdropFilter: 'blur(14px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(14px) saturate(1.3)',
      } as object)
    : null;

const styles = StyleSheet.create({
  root: { width: '100%', maxWidth: '100%' },
  fieldError: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.danger,
    marginTop: spacing.sm,
  },
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
    minWidth: 88,
    fontSize: 64,
    lineHeight: displayLH(64),
    fontFamily: fonts.displayHeavy,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: -2,
    padding: 0,
    margin: 0,
  },
  goalValueNarrow: {
    minWidth: 72,
    fontSize: 52,
    lineHeight: displayLH(52),
    letterSpacing: -1.5,
  },
  goalUnit: {
    fontSize: 24,
    lineHeight: displayLH(24),
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
  calorieRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    marginTop: spacing.md,
  },
  calorieTilde: {
    fontFamily: fonts.display,
    fontSize: 32,
    lineHeight: displayLH(32),
    color: colors.textTertiary,
    marginBottom: 6,
  },
  calorieTildeNarrow: {
    fontSize: 26,
    lineHeight: displayLH(26),
    marginBottom: 5,
  },
  calorieValue: {
    minWidth: 72,
    fontSize: 44,
    lineHeight: displayLH(44),
    fontFamily: fonts.displayHeavy,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1.2,
    padding: 0,
    margin: 0,
  },
  calorieValueNarrow: {
    minWidth: 60,
    fontSize: 36,
    lineHeight: displayLH(36),
    letterSpacing: -1,
  },
  calorieUnit: {
    fontSize: 18,
    lineHeight: displayLH(18),
    fontFamily: fonts.display,
    color: colors.textTertiary,
    marginBottom: 7,
    flexShrink: 0,
  },
  calorieUnitNarrow: { fontSize: 15, marginBottom: 5 },
  resetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  suggestChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,122,89,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 122, 89, 0.4)',
  },
  suggestSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  suggestChipText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.4,
    color: colors.accentLight,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairlineBright,
    marginVertical: spacing.lg,
  },
  breakdownLabel: {
    ...type.label,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
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
  ctaGlow: {
    marginTop: spacing.xl,
    borderRadius: 13,
    ...shadowAccent,
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: colors.accent,
          shadowOpacity: 0.4,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
        }
      : null),
  },
  ctaGlowDisabled: {
    ...Platform.select({
      web: { boxShadow: 'none' } as object,
      ios: { shadowOpacity: 0, shadowRadius: 0 },
      default: { elevation: 0 },
    }),
  },
  ctaPressable: {
    borderRadius: 13,
    overflow: 'hidden',
  },
  ctaPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  ctaInner: {
    minHeight: layout.controlHeight + 4,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 13,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 249, 247, 0.22)',
  },
  ctaSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  ctaLabel: {
    fontFamily: fonts.displayHeavy,
    fontSize: 16,
    letterSpacing: 0.25,
    color: colors.onAccent,
  },
  ctaLabelDisabled: {
    color: 'rgba(255, 249, 247, 0.72)',
  },
});
