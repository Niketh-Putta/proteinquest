import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { MealPhotoPreview } from '@/components/MealPhotoPreview';
import { PageCanvas } from '@/components/PageCanvas';
import { fetchLogById, getFoodPhotoUrl, updateLog } from '@/lib/api';
import { useLayout } from '@/lib/layout';
import {
  CALORIE_OVERRIDE_BUFFER,
  PROTEIN_OVERRIDE_BUFFER_G,
  clampCalorieOverride,
  clampProteinOverride,
  maxAllowedOverride,
} from '@/lib/log-limits';
import type { FoodItem, ProteinLog } from '@/lib/types';
import { colors, displayLH, fonts, pressableWeb, spacing, textInputWeb } from '@/theme';

function asItems(raw: ProteinLog['items']): FoodItem[] {
  return Array.isArray(raw) ? raw : [];
}

export default function MealDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { horizontalPad, contentMaxWidth, contentWidth } = useLayout();
  const [log, setLog] = useState<ProteinLog | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [foodName, setFoodName] = useState('');
  const [items, setItems] = useState<FoodItem[]>([]);
  const [proteinOverride, setProteinOverride] = useState('');
  const [calorieOverride, setCalorieOverride] = useState('');
  const [anchorProtein, setAnchorProtein] = useState(0);
  const [anchorCalories, setAnchorCalories] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!id) {
        setError('Meal not found');
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const row = await fetchLogById(id);
        if (cancelled) return;
        if (!row) {
          setError('Meal not found');
          setLog(null);
          return;
        }
        setLog(row);
        setFoodName(row.food_name);
        setItems(asItems(row.items));
        const protein = Number(row.protein_g) || 0;
        const calories =
          row.calories != null && Number(row.calories) > 0 ? Number(row.calories) : 0;
        setAnchorProtein(protein);
        setAnchorCalories(calories);
        setProteinOverride(String(Math.round(protein)));
        setCalorieOverride(calories > 0 ? String(Math.round(calories)) : '');
        const uri = await getFoodPhotoUrl(row.image_path);
        if (!cancelled) setPhotoUri(uri);
      } catch {
        if (!cancelled) setError('Could not load this meal');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleSave() {
    if (!log) return;
    const proteinEntered = parseFloat(proteinOverride);
    if (Number.isNaN(proteinEntered) || proteinEntered < 0) {
      setError('Enter the protein amount in grams.');
      return;
    }
    const proteinClamp = clampProteinOverride(proteinEntered, anchorProtein);
    if (proteinClamp.clamped) {
      setProteinOverride(String(proteinClamp.max));
      setError(
        `Protein capped at ${proteinClamp.max}g, the most we can verify from this photo.`,
      );
      return;
    }
    const proteinG = proteinClamp.value;

    const calorieRaw = calorieOverride.trim();
    const caloriesParsed = calorieRaw.length > 0 ? parseFloat(calorieRaw) : NaN;
    if (calorieRaw.length > 0 && !Number.isFinite(caloriesParsed)) {
      setError('Enter calories as a number.');
      return;
    }
    const caloriesEntered =
      Number.isFinite(caloriesParsed) && caloriesParsed >= 0
        ? Math.round(caloriesParsed)
        : anchorCalories > 0
          ? Math.round(anchorCalories)
          : Math.max(Math.round(proteinG) * 8, 50);
    const calorieClamp = clampCalorieOverride(caloriesEntered, anchorCalories || caloriesEntered);
    if (calorieClamp.clamped) {
      setCalorieOverride(String(calorieClamp.max));
      setError(`Calories capped at ${calorieClamp.max}, the most we can verify from this photo.`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateLog(log.id, {
        foodName: foodName.trim() || 'Meal',
        proteinG,
        calories: calorieClamp.value,
        items,
      });
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/today');
    } catch {
      setError('Could not save changes. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageCanvas>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View
          style={[
            styles.topBar,
            {
              paddingHorizontal: horizontalPad,
              maxWidth: contentMaxWidth,
              width: '100%',
              alignSelf: 'center',
            },
          ]}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/today'))}
            hitSlop={12}
            style={({ pressed }) => [styles.iconBtn, pressableWeb, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
          <Text style={styles.topTitle}>MEAL</Text>
          <View style={styles.iconBtn} />
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => setError(null)} hitSlop={8}>
              <Ionicons name="close" size={16} color={colors.danger} />
            </Pressable>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : !log ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>Meal not found</Text>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              styles.resultScroll,
              {
                paddingHorizontal: horizontalPad,
                maxWidth: contentMaxWidth,
                width: contentWidth,
                alignSelf: 'center',
              },
            ]}>
            {photoUri ? (
              <Animated.View entering={FadeIn} style={styles.resultImageWrap}>
                <MealPhotoPreview uri={photoUri} bordered />
              </Animated.View>
            ) : null}

            <Animated.View entering={FadeInDown.delay(80).duration(400)}>
              <TextInput
                style={[styles.foodName, styles.foodNameInput, textInputWeb]}
                value={foodName}
                onChangeText={setFoodName}
                placeholder="Meal name"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="sentences"
                autoCorrect
                maxLength={80}
                returnKeyType="done"
                accessibilityLabel="Edit food name"
              />
              <Text style={styles.metaText}>
                TAP NAME TO EDIT
                {log.confidence ? ` · ${log.confidence.toUpperCase()} CONFIDENCE` : ''}
              </Text>
            </Animated.View>

            <View style={styles.rule} />

            {items.length > 0 ? (
              <Animated.View entering={FadeInDown.delay(160).duration(400)}>
                {items.map((item, i) => (
                  <View
                    key={`${item.name}-${i}`}
                    style={[styles.itemRow, i > 0 && styles.itemRowBorder]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemPortion}>
                        {item.estimated_grams ? `~${item.estimated_grams}g · ` : ''}
                        {item.portion}
                      </Text>
                    </View>
                    <View style={styles.itemRight}>
                      <Text style={styles.itemProtein}>
                        {item.protein_g < 10
                          ? item.protein_g.toFixed(1)
                          : Math.round(item.protein_g)}
                        g
                      </Text>
                      {item.confidence === 'low' ? (
                        <Text style={styles.itemLowConf}>low conf.</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </Animated.View>
            ) : null}

            <View style={styles.rule} />

            <Animated.View entering={FadeInDown.delay(240).duration(400)} style={styles.totalBlock}>
              <Text style={styles.totalLabel}>TOTAL PROTEIN</Text>
              <View style={styles.totalInputRow}>
                <TextInput
                  style={[
                    styles.totalInput,
                    textInputWeb,
                    Platform.OS === 'web'
                      ? ({ width: `${Math.max(proteinOverride.length, 1)}ch` } as object)
                      : null,
                  ]}
                  value={proteinOverride}
                  onChangeText={(t) => setProteinOverride(t.replace(/[^0-9.]/g, ''))}
                  keyboardType="numeric"
                  maxLength={5}
                />
                <Text style={styles.totalUnit}>g</Text>
              </View>
              <Text style={styles.totalHint}>
                tap to adjust · max{' '}
                {maxAllowedOverride(anchorProtein, PROTEIN_OVERRIDE_BUFFER_G)}g
              </Text>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(280).duration(400)} style={styles.totalBlock}>
              <Text style={styles.totalLabel}>CALORIES</Text>
              <View style={styles.totalInputRow}>
                <TextInput
                  style={[
                    styles.totalInput,
                    textInputWeb,
                    Platform.OS === 'web'
                      ? ({ width: `${Math.max(calorieOverride.length, 1)}ch` } as object)
                      : null,
                  ]}
                  value={calorieOverride}
                  onChangeText={(t) => setCalorieOverride(t.replace(/[^0-9.]/g, ''))}
                  keyboardType="numeric"
                  maxLength={5}
                />
                <Text style={styles.totalUnit}>cal</Text>
              </View>
              <Text style={styles.totalHint}>
                tap to adjust · max{' '}
                {maxAllowedOverride(anchorCalories || Number(calorieOverride) || 0, CALORIE_OVERRIDE_BUFFER)}
              </Text>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(320)} style={{ gap: 4, marginTop: spacing.lg }}>
              <Button title="Save changes" onPress={handleSave} loading={saving} />
              <Button
                title="Close"
                variant="ghost"
                onPress={() =>
                  router.canGoBack() ? router.back() : router.replace('/(tabs)/today')
                }
              />
            </Animated.View>
          </ScrollView>
        )}
      </SafeAreaView>
    </PageCanvas>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineBright,
  },
  topTitle: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.textTertiary,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 80, 80, 0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 80, 80, 0.35)',
  },
  errorText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.danger },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textSecondary,
  },
  resultScroll: { paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  resultImageWrap: {
    width: '85%',
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  foodName: {
    fontFamily: fonts.displayHeavy,
    fontSize: 28,
    lineHeight: displayLH(28),
    color: colors.text,
    letterSpacing: -0.8,
  },
  foodNameInput: {
    paddingVertical: spacing.xs,
    paddingHorizontal: 0,
    margin: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairlineBright,
  },
  metaText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.textTertiary,
    marginTop: 6,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairlineBright,
    marginVertical: spacing.lg,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: spacing.md,
  },
  itemRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  itemName: { fontFamily: fonts.displayMedium, fontSize: 14, color: colors.text },
  itemPortion: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textTertiary,
    marginTop: 2,
    letterSpacing: 0.3,
  },
  itemRight: { alignItems: 'flex-end' },
  itemProtein: {
    fontFamily: fonts.display,
    fontSize: 16,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  itemLowConf: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textTertiary,
    marginTop: 2,
  },
  totalBlock: { marginBottom: spacing.md },
  totalLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1.6,
    color: colors.textTertiary,
    marginBottom: 4,
  },
  totalInputRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  totalInput: {
    fontFamily: fonts.displayHeavy,
    fontSize: 40,
    lineHeight: displayLH(40),
    color: colors.text,
    letterSpacing: -1.2,
    minWidth: 48,
    padding: 0,
    margin: 0,
  },
  totalUnit: {
    fontFamily: fonts.mono,
    fontSize: 16,
    color: colors.textTertiary,
  },
  totalHint: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textTertiary,
    marginTop: 4,
    letterSpacing: 0.3,
  },
});
