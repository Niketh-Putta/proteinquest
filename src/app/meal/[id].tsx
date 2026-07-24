import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { MealPhotoPreview } from '@/components/MealPhotoPreview';
import { PageCanvas } from '@/components/PageCanvas';
import { fetchLogById, getFoodPhotoUrl, updateLog } from '@/lib/api';
import { getLocalMealPhoto } from '@/lib/local-meal-photo';
import { useContentColumn, useLayout } from '@/lib/layout';
import {
  CALORIE_OVERRIDE_BUFFER,
  PROTEIN_OVERRIDE_BUFFER_G,
  clampCalorieOverride,
  clampProteinOverride,
  maxAllowedOverride,
} from '@/lib/log-limits';
import { todayISODate } from '@/lib/protein';
import {
  parseNutritionNumber,
  sanitizeNutritionDraft,
} from '@/lib/parse-nutrition-number';
import {
  consumePendingIngredientEdit,
  registerIngredientEditApplier,
  type ScanIngredientEdit,
} from '@/lib/scan-ingredient-edit';
import type { FoodItem, ProteinLog } from '@/lib/types';
import {
  colors,
  displayLH,
  fonts,
  layout,
  pressableWeb,
  radius,
  spacing,
  textInputWeb,
} from '@/theme';

function asItems(raw: ProteinLog['items']): FoodItem[] {
  return Array.isArray(raw) ? raw : [];
}

function formatMealMeta(createdAt: string | null | undefined): string {
  const d = createdAt ? new Date(createdAt) : new Date();
  if (Number.isNaN(d.getTime())) return 'Logged meal';
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const today = todayISODate();
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
  if (day === today) return `Scanned today, ${time}`;
  return `Scanned ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
}

export default function MealDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { formWidth, height, horizontalPad, isTablet, isDesktop, width } = useLayout();
  const insets = useSafeAreaInsets();
  const column = useContentColumn('form');
  const formSideInset = Math.max(0, (width - formWidth) / 2);
  const headerPadLeft = Math.max(horizontalPad, insets.left - formSideInset);
  const headerPadRight = Math.max(horizontalPad, insets.right - formSideInset);
  const tinyH = height < 700;
  const compactH = height < 780;
  const stageMaxWidth = Math.min(formWidth, isDesktop ? 560 : isTablet ? 520 : 480);

  const foodNameRef = useRef<TextInput>(null);
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
        const uri =
          (await getFoodPhotoUrl(row.image_path)) ?? getLocalMealPhoto(row.id);
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

  const applyIngredientEdit = useCallback((edit: ScanIngredientEdit) => {
    setItems((prev) => {
      const action = edit.action ?? 'update';
      let next = [...prev];

      if (action === 'delete') {
        if (edit.index < 0 || edit.index >= next.length) return prev;
        next = next.filter((_, i) => i !== edit.index);
      } else if (action === 'add') {
        next.push({
          name: edit.name,
          portion: edit.portion,
          protein_g: edit.protein_g,
          calories_g: edit.calories_g,
          estimated_grams: edit.estimated_grams,
          confidence: 'medium',
        });
      } else {
        const current = next[edit.index];
        if (!current) return prev;
        next[edit.index] = {
          ...current,
          name: edit.name,
          portion: edit.portion,
          protein_g: edit.protein_g,
          calories_g: edit.calories_g,
          estimated_grams: edit.estimated_grams,
        };
      }

      const totalProtein = next.reduce((s, i) => s + (Number(i.protein_g) || 0), 0);
      const itemCalSum = next.reduce((s, i) => {
        const c = Number(i.calories_g);
        return s + (Number.isFinite(c) && c >= 0 ? c : 0);
      }, 0);
      const nextProtein = Math.round(totalProtein * 10) / 10;
      const nextCalories = Math.round(itemCalSum);

      setAnchorProtein(nextProtein);
      setAnchorCalories(nextCalories);
      setProteinOverride(String(nextProtein));
      setCalorieOverride(String(nextCalories));
      return next;
    });
  }, []);

  useEffect(() => registerIngredientEditApplier(applyIngredientEdit), [applyIngredientEdit]);

  useFocusEffect(
    useCallback(() => {
      const edit = consumePendingIngredientEdit();
      if (edit) applyIngredientEdit(edit);
    }, [applyIngredientEdit]),
  );

  async function handleSave() {
    if (!log || saving) return;
    const proteinEntered = parseNutritionNumber(proteinOverride);
    if (proteinEntered == null || proteinEntered < 0) {
      setError('Enter the protein amount in grams.');
      return;
    }
    const proteinClamp = clampProteinOverride(proteinEntered, anchorProtein);
    // Soft-clamp: apply the max and still save (do not dead-end the CTA).
    if (proteinClamp.clamped) {
      setProteinOverride(String(proteinClamp.max));
    }
    const proteinG = proteinClamp.value;

    const calorieRaw = calorieOverride.trim();
    const caloriesParsed = calorieRaw.length > 0 ? parseNutritionNumber(calorieRaw) : null;
    if (calorieRaw.length > 0 && caloriesParsed == null) {
      setError('Enter calories as a number.');
      return;
    }
    const caloriesEntered =
      caloriesParsed != null && caloriesParsed >= 0
        ? Math.round(caloriesParsed)
        : anchorCalories > 0
          ? Math.round(anchorCalories)
          : Math.max(Math.round(proteinG) * 8, 50);
    const calorieClamp = clampCalorieOverride(caloriesEntered, anchorCalories || caloriesEntered);
    if (calorieClamp.clamped) {
      setCalorieOverride(String(calorieClamp.max));
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // Prefer back so Today stays mounted (keeps thumbs/dragon warm).
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/today');
    } catch (e) {
      const msg =
        e instanceof Error && e.message ? e.message : 'Could not save changes. Try again.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/today'));

  return (
    <PageCanvas>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View
          style={[
            styles.topBar,
            column,
            { paddingLeft: headerPadLeft, paddingRight: headerPadRight },
          ]}>
          <Pressable
            onPress={close}
            hitSlop={12}
            style={({ pressed }) => [styles.iconBtn, pressableWeb, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
          <Text style={styles.topTitle}>CONFIRM & LOG</Text>
          <View style={styles.iconBtnSpacer} />
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
            keyboardShouldPersistTaps="always"
            contentContainerStyle={[
              styles.resultScroll,
              column,
              { paddingLeft: headerPadLeft, paddingRight: headerPadRight },
            ]}>
            {photoUri ? (
              <Animated.View
                entering={FadeIn}
                style={[
                  styles.resultImageWrap,
                  {
                    maxWidth: Math.min(stageMaxWidth, isTablet || isDesktop ? 480 : 420),
                  },
                ]}>
                <View style={styles.resultPhotoShell}>
                  <MealPhotoPreview
                    uri={photoUri}
                    square
                    bordered={false}
                    borderRadius={radius.md}
                    maxHeightRatio={
                      tinyH ? 0.34 : compactH ? 0.38 : isTablet || isDesktop ? 0.4 : 0.42
                    }
                  />
                  {log.confidence ? (
                    <View style={styles.confidenceBadge} pointerEvents="none">
                      <Ionicons name="star" size={12} color={colors.accent} />
                      <Text style={styles.confidenceBadgeText}>
                        <Text style={styles.confidenceLevel}>
                          {log.confidence.toUpperCase()}
                        </Text>
                        {' CONFIDENCE'}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Animated.View>
            ) : null}

            <Animated.View
              entering={FadeInDown.delay(80).duration(400)}
              style={styles.resultTitleBlock}>
              <View style={styles.foodNameRow}>
                <TextInput
                  ref={foodNameRef}
                  style={[styles.foodName, styles.foodNameInput, textInputWeb, { flex: 1 }]}
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
                <Pressable
                  onPress={() => foodNameRef.current?.focus()}
                  hitSlop={10}
                  accessibilityLabel="Edit food name"
                  style={styles.foodNameEditBtn}>
                  <Ionicons name="pencil" size={18} color={colors.text} />
                </Pressable>
              </View>
              <Text style={styles.metaText}>{formatMealMeta(log.created_at)}</Text>
            </Animated.View>

            <Animated.View
              entering={FadeInDown.delay(160).duration(400)}
              style={styles.nutritionCard}>
              <View style={styles.nutritionCol}>
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
                    onChangeText={(t) => setProteinOverride(sanitizeNutritionDraft(t))}
                    keyboardType="numeric"
                    maxLength={16}
                  />
                  <Text style={styles.totalUnit}>g</Text>
                </View>
                <Text style={styles.totalHint}>
                  tap to adjust • max{' '}
                  {maxAllowedOverride(anchorProtein, PROTEIN_OVERRIDE_BUFFER_G)}g
                </Text>
              </View>
              <View style={styles.nutritionDivider} />
              <View style={styles.nutritionCol}>
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
                    onChangeText={(t) => setCalorieOverride(sanitizeNutritionDraft(t))}
                    keyboardType="numeric"
                    maxLength={16}
                  />
                  <Text style={styles.totalUnit}>cal</Text>
                </View>
                <Text style={styles.totalHint}>
                  tap to adjust • max{' '}
                  {maxAllowedOverride(
                    anchorCalories || Number(calorieOverride) || 0,
                    CALORIE_OVERRIDE_BUFFER,
                  )}
                </Text>
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(220).duration(400)}>
              <View style={styles.ingredientsCard}>
                <View style={styles.ingredientsHeader}>
                  <Text style={styles.ingredientsTitle}>INGREDIENTS ({items.length})</Text>
                </View>

                {items.map((item, i) => {
                  const totalProtein = items.reduce(
                    (s, it) => s + (Number(it.protein_g) || 0),
                    0,
                  );
                  const totalCal = Number(calorieOverride) || anchorCalories || 0;
                  const itemCalories =
                    typeof item.calories_g === 'number' && item.calories_g >= 0
                      ? item.calories_g
                      : totalProtein > 0
                        ? Math.round(totalCal * (item.protein_g / totalProtein))
                        : Math.round(totalCal / Math.max(items.length, 1));
                  return (
                    <Pressable
                      key={`${item.name}-${i}`}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        const q = new URLSearchParams({
                          index: String(i),
                          name: item.name,
                          portion: item.portion || '1 serving',
                          protein: String(item.protein_g),
                          calories: String(itemCalories),
                        });
                        if (item.estimated_grams != null) {
                          q.set('grams', String(item.estimated_grams));
                        }
                        router.push(`/scan-adjust?${q.toString()}` as never);
                      }}
                      style={[styles.ingredientRow, i > 0 && styles.ingredientRowBorder]}
                      accessibilityRole="button"
                      accessibilityLabel={`Adjust ${item.name}`}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.itemName} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={styles.itemPortion} numberOfLines={1}>
                          {item.estimated_grams ? `~${item.estimated_grams}g • ` : ''}
                          {item.portion}
                        </Text>
                      </View>
                      <Text style={styles.itemProtein}>
                        {item.protein_g < 10
                          ? item.protein_g.toFixed(1)
                          : Math.round(item.protein_g)}
                        g
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  router.push('/scan-ingredient' as never);
                }}
                style={({ pressed }) => [
                  styles.addIngredientRow,
                  pressableWeb,
                  pressed && { opacity: 0.88 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Add ingredient">
                <View style={styles.addIngredientIcon}>
                  <Ionicons name="add" size={18} color={colors.accent} />
                </View>
                <Text style={styles.addIngredientText}>Add ingredient</Text>
              </Pressable>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(320)} style={styles.resultActions}>
              <Pressable
                onPress={() => {
                  void handleSave();
                }}
                disabled={saving}
                hitSlop={8}
                pressRetentionOffset={{ top: 20, bottom: 20, left: 20, right: 20 }}
                style={({ pressed }) => [
                  styles.logItBtn,
                  pressableWeb,
                  saving && { opacity: 0.5 },
                  pressed && !saving && { opacity: 0.85 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Save changes">
                {saving ? (
                  <ActivityIndicator color={colors.onAccent} />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={22} color={colors.onAccent} />
                    <Text style={styles.logItBtnText}>Save changes</Text>
                  </>
                )}
              </Pressable>
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
    width: layout.iconBtn,
    height: layout.iconBtn,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: layout.iconBtn / 2,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineBright,
  },
  iconBtnSpacer: {
    width: layout.iconBtn,
    height: layout.iconBtn,
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
    padding: layout.cardPad,
    borderRadius: layout.fieldRadius,
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
    fontSize: 15,
    color: colors.textSecondary,
  },
  resultScroll: { paddingTop: spacing.sm, paddingBottom: layout.scrollBottomPad },
  resultImageWrap: {
    width: '100%',
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  resultPhotoShell: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    borderRadius: radius.md,
  },
  confidenceBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.full,
    backgroundColor: 'rgba(12, 11, 16, 0.82)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  confidenceBadgeText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.1,
    color: colors.text,
  },
  confidenceLevel: {
    color: colors.accent,
    fontFamily: fonts.mono,
  },
  resultTitleBlock: {
    marginBottom: spacing.md,
  },
  foodNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
    borderBottomWidth: 0,
  },
  foodNameEditBtn: {
    padding: 4,
  },
  metaText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textTertiary,
    marginTop: 2,
  },
  nutritionCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.md,
  },
  nutritionCol: {
    flex: 1,
    paddingHorizontal: spacing.sm,
  },
  nutritionDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairlineBright,
    alignSelf: 'stretch',
  },
  ingredientsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    marginBottom: spacing.sm,
  },
  ingredientsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  ingredientsTitle: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.6,
    color: colors.textSecondary,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: spacing.sm,
  },
  ingredientRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  addIngredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    marginBottom: spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,138,61,0.28)',
  },
  addIngredientIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,138,61,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,138,61,0.4)',
  },
  addIngredientText: {
    fontFamily: fonts.displayMedium,
    fontSize: 15,
    color: colors.accent,
  },
  itemName: { fontFamily: fonts.displayMedium, fontSize: 15, color: colors.text },
  itemPortion: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 2,
  },
  itemProtein: {
    fontFamily: fonts.display,
    fontSize: 15,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  totalLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.4,
    color: colors.textTertiary,
  },
  totalInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: 2,
  },
  totalInput: {
    fontSize: 40,
    lineHeight: displayLH(40),
    fontFamily: fonts.displayHeavy,
    color: colors.accent,
    fontVariant: ['tabular-nums'],
    padding: 0,
    minWidth: 28,
    letterSpacing: -1.2,
  },
  totalUnit: {
    fontSize: 18,
    lineHeight: displayLH(18),
    fontFamily: fonts.displayHeavy,
    color: colors.accent,
    marginBottom: 8,
    marginLeft: 1,
  },
  totalHint: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 0.3,
    marginTop: 4,
  },
  resultActions: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  logItBtn: {
    height: 54,
    borderRadius: radius.button,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logItBtnText: {
    fontFamily: fonts.displayMedium,
    fontSize: 16,
    color: colors.onAccent,
    letterSpacing: 0.2,
  },
});
