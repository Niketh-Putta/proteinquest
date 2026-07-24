import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GlassPanel } from '@/components/GlassPanel';
import { PageCanvas } from '@/components/PageCanvas';
import { useLayout } from '@/lib/layout';
import {
  ADJUST_SIZES,
  ADJUST_SIZE_SCALE,
  AdjustSize,
  buildAdjustQuestion,
  buildSizePortion,
  formatQuantityLabel,
  formatSizeLabel,
  parsePortionQuantity,
  parsePortionSize,
  pluralizeFood,
  resolveAdjustQuantityMode,
  setPendingIngredientEdit,
} from '@/lib/scan-ingredient-edit';
import { colors, displayLH, fonts, pressableWeb, radius, spacing } from '@/theme';

const QUANTITIES = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8] as const;
const ITEM_H = 48;
const VISIBLE_ROWS = 5;
const PICKER_H = ITEM_H * VISIBLE_ROWS;
const PAD_ROWS = 2;

function paramString(value: string | string[] | undefined, fallback = ''): string {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function nearestQuantityIndex(qty: number): number {
  let best = 0;
  let bestDist = Infinity;
  QUANTITIES.forEach((q, i) => {
    const d = Math.abs(q - qty);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

function roundProtein(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 10) / 10;
}

export default function ScanAdjustScreen() {
  const { horizontalPad, contentMaxWidth, contentWidth } = useLayout();
  const { height: winH } = useWindowDimensions();
  const compact = winH < 720;
  const params = useLocalSearchParams<{
    index?: string;
    name?: string;
    portion?: string;
    protein?: string;
    calories?: string;
    grams?: string;
    mode?: string;
  }>();

  const isAdd = paramString(params.mode) === 'add';

  const index = useMemo(() => {
    const n = parseInt(paramString(params.index, '0'), 10);
    if (isAdd) return -1;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [params.index, isAdd]);

  const name = paramString(params.name, 'Food');
  const initialPortion = paramString(params.portion, '1 serving');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const mode = useMemo(
    () => resolveAdjustQuantityMode(name, initialPortion),
    [name, initialPortion],
  );
  const sizeMode = mode === 'size';

  const { qty: parsedQty, rest: portionRest } = useMemo(
    () => parsePortionQuantity(initialPortion),
    [initialPortion],
  );
  // New ingredients always start at quantity 1; catalog macros are per unit.
  const baseQty = isAdd ? 1 : parsedQty;
  const initialSize = useMemo(() => parsePortionSize(initialPortion), [initialPortion]);

  const baseProtein = useMemo(() => {
    const n = parseFloat(paramString(params.protein, '0'));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [params.protein]);

  const baseCalories = useMemo(() => {
    const n = parseFloat(paramString(params.calories, '0'));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [params.calories]);

  const baseGrams = useMemo(() => {
    const raw = paramString(params.grams);
    if (!raw) return undefined;
    const n = parseFloat(raw);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, [params.grams]);

  const proteinPerUnit = isAdd
    ? baseProtein
    : baseQty > 0
      ? baseProtein / baseQty
      : baseProtein;
  const caloriesPerUnit = isAdd
    ? baseCalories
    : baseQty > 0
      ? baseCalories / baseQty
      : baseCalories;
  const gramsPerUnit = isAdd
    ? baseGrams
    : baseGrams != null && baseQty > 0
      ? baseGrams / baseQty
      : baseGrams;

  const options = sizeMode ? ADJUST_SIZES : QUANTITIES;
  const snapOffsets = useMemo(
    () => options.map((_, i) => i * ITEM_H),
    [options],
  );

  const initialIndex = sizeMode
    ? Math.max(0, ADJUST_SIZES.indexOf(isAdd ? 'medium' : initialSize))
    : nearestQuantityIndex(isAdd ? 1 : baseQty);
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const scrollRef = useRef<ScrollView>(null);
  const selectedIndexRef = useRef(initialIndex);
  const lastOffsetYRef = useRef(initialIndex * ITEM_H);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProgrammaticSnapRef = useRef(false);

  const qty = sizeMode ? 1 : (QUANTITIES[selectedIndex] ?? 1);
  const size: AdjustSize = sizeMode
    ? (ADJUST_SIZES[selectedIndex] ?? 'medium')
    : 'medium';
  const sizeScale = sizeMode ? ADJUST_SIZE_SCALE[size] : qty;

  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  useEffect(() => {
    const y = initialIndex * ITEM_H;
    const id = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y, animated: false });
    });
    return () => {
      cancelAnimationFrame(id);
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    };
  }, [initialIndex]);

  // Seed pending add so back / leave commits even if the wheel was never touched.
  useEffect(() => {
    if (!isAdd) return;
    const nextQty = sizeMode ? 1 : (QUANTITIES[initialIndex] ?? 1);
    const nextSize: AdjustSize = sizeMode
      ? (ADJUST_SIZES[initialIndex] ?? 'medium')
      : 'medium';
    const scale = sizeMode ? ADJUST_SIZE_SCALE[nextSize] : nextQty;
    const protein = roundProtein(
      sizeMode ? baseProtein * scale : proteinPerUnit * nextQty,
    );
    const calories = Math.max(
      0,
      Math.round(sizeMode ? baseCalories * scale : caloriesPerUnit * nextQty),
    );
    let grams: number | undefined;
    if (baseGrams != null) {
      if (sizeMode) grams = Math.max(0, Math.round(baseGrams * scale));
      else if (gramsPerUnit != null) grams = Math.max(0, Math.round(gramsPerUnit * nextQty));
    }
    const portion = sizeMode
      ? buildSizePortion(nextSize, name)
      : nextQty === 0
        ? 'none'
        : `${formatQuantityLabel(nextQty)} ${portionRest || pluralizeFood(name, nextQty)}`.trim();
    setPendingIngredientEdit({
      index: -1,
      name: name.trim() || 'Ingredient',
      portion,
      protein_g: protein,
      calories_g: calories,
      estimated_grams: grams,
      action: 'add',
    });
  }, [
    isAdd,
    initialIndex,
    sizeMode,
    baseProtein,
    baseCalories,
    baseGrams,
    proteinPerUnit,
    caloriesPerUnit,
    gramsPerUnit,
    name,
    portionRest,
  ]);

  const scaledProtein = roundProtein(
    sizeMode ? baseProtein * sizeScale : proteinPerUnit * qty,
  );
  const scaledCalories = Math.max(
    0,
    Math.round(sizeMode ? baseCalories * sizeScale : caloriesPerUnit * qty),
  );
  const scaledGrams = (() => {
    if (baseGrams == null) return undefined;
    if (sizeMode) return Math.max(0, Math.round(baseGrams * sizeScale));
    if (gramsPerUnit == null) return undefined;
    return Math.max(0, Math.round(gramsPerUnit * qty));
  })();

  const unitLabel = portionRest || pluralizeFood(name, qty === 0 ? 2 : qty);
  const question = useMemo(
    () => buildAdjustQuestion(name, initialPortion, mode),
    [name, initialPortion, mode],
  );

  const proteinLow = roundProtein(scaledProtein * 0.75);
  const proteinHigh = roundProtein(scaledProtein * 1.25);
  const calLow = Math.max(0, Math.round(scaledCalories * 0.8));
  const calHigh = Math.max(0, Math.round(scaledCalories * 1.2));

  const countPortionText =
    qty === 0 ? 'none' : `${formatQuantityLabel(qty)} ${unitLabel}`.trim();
  const sizePortionText = formatSizeLabel(size);

  const portionLine = [
    scaledGrams != null && scaledGrams > 0 ? `~${scaledGrams}g` : null,
    sizeMode ? sizePortionText : countPortionText,
  ]
    .filter(Boolean)
    .join(' • ');

  const summaryText = sizeMode
    ? `~ ${formatSizeLabel(size)} ${name}`.trim()
    : qty === 0
      ? 'None'
      : `~ ${formatQuantityLabel(qty)} ${unitLabel}`.trim();

  function indexFromOffset(y: number) {
    return Math.max(0, Math.min(options.length - 1, Math.round(y / ITEM_H)));
  }

  function buildPortion(nextQty: number): string {
    if (nextQty === 0) return 'none';
    const label = portionRest || pluralizeFood(name, nextQty);
    return `${formatQuantityLabel(nextQty)} ${label}`.trim();
  }

  function buildEditAtIndex(i: number) {
    const nextQty = sizeMode ? 1 : (QUANTITIES[i] ?? 1);
    const nextSize: AdjustSize = sizeMode
      ? (ADJUST_SIZES[i] ?? 'medium')
      : 'medium';
    const scale = sizeMode ? ADJUST_SIZE_SCALE[nextSize] : nextQty;
    const protein = roundProtein(
      sizeMode ? baseProtein * scale : proteinPerUnit * nextQty,
    );
    const calories = Math.max(
      0,
      Math.round(sizeMode ? baseCalories * scale : caloriesPerUnit * nextQty),
    );
    let grams: number | undefined;
    if (baseGrams != null) {
      if (sizeMode) grams = Math.max(0, Math.round(baseGrams * scale));
      else if (gramsPerUnit != null) grams = Math.max(0, Math.round(gramsPerUnit * nextQty));
    }
    return {
      index,
      name: name.trim() || 'Ingredient',
      portion: sizeMode ? buildSizePortion(nextSize, name) : buildPortion(nextQty),
      protein_g: protein,
      calories_g: calories,
      estimated_grams: grams,
    };
  }

  function persistAtIndex(i: number) {
    setPendingIngredientEdit({
      ...buildEditAtIndex(i),
      action: isAdd ? 'add' : 'update',
    });
  }

  function applyIndex(i: number, haptic: boolean) {
    if (i !== selectedIndexRef.current) {
      selectedIndexRef.current = i;
      setSelectedIndex(i);
      if (haptic) Haptics.selectionAsync().catch(() => {});
    }
    persistAtIndex(i);
  }

  function snapToNearest(y: number, animated: boolean) {
    const i = indexFromOffset(y);
    const snapped = i * ITEM_H;
    applyIndex(i, true);
    if (Math.abs(y - snapped) > 0.5) {
      isProgrammaticSnapRef.current = true;
      scrollRef.current?.scrollTo({ y: snapped, animated });
      if (animated) {
        setTimeout(() => {
          isProgrammaticSnapRef.current = false;
        }, 220);
      } else {
        isProgrammaticSnapRef.current = false;
      }
    }
  }

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (isProgrammaticSnapRef.current) return;
    const y = e.nativeEvent.contentOffset.y;
    lastOffsetYRef.current = y;
    const i = indexFromOffset(y);
    if (i !== selectedIndexRef.current) {
      selectedIndexRef.current = i;
      setSelectedIndex(i);
    }
    // Web often skips momentum-end; debounce hard snap after scroll quiets.
    if (Platform.OS !== 'web') return;
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      snapToNearest(lastOffsetYRef.current, true);
    }, 90);
  }

  function onScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    snapToNearest(e.nativeEvent.contentOffset.y, true);
  }

  function selectIndex(i: number) {
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    applyIndex(i, true);
    isProgrammaticSnapRef.current = true;
    scrollRef.current?.scrollTo({ y: i * ITEM_H, animated: true });
    setTimeout(() => {
      isProgrammaticSnapRef.current = false;
    }, 220);
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/scan');
  }

  /** Commit current wheel selection and leave (add dismisses search + adjust). */
  function saveAndBack() {
    persistAtIndex(selectedIndexRef.current);
    if (isAdd) {
      try {
        router.dismiss(2);
      } catch {
        goBack();
      }
      return;
    }
    goBack();
  }

  function confirmDelete() {
    setDeleteOpen(false);
    setPendingIngredientEdit({
      action: 'delete',
      index,
      name: name.trim() || 'Ingredient',
      portion: initialPortion,
      protein_g: 0,
      calories_g: 0,
    });
    goBack();
  }

  function requestDelete() {
    setDeleteOpen(true);
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
            onPress={saveAndBack}
            hitSlop={12}
            style={({ pressed }) => [styles.iconBtn, pressableWeb, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <View style={styles.titleWrap}>
            <Text style={styles.topTitle} numberOfLines={1}>
              {isAdd ? `Add ${name}` : `Adjust ${name}`}
            </Text>
            <View style={styles.titleAccent} />
          </View>
          {!isAdd ? (
            <Pressable
              onPress={requestDelete}
              hitSlop={12}
              style={({ pressed }) => [styles.iconBtn, pressableWeb, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${name}`}>
              <Ionicons name="trash-outline" size={20} color={colors.textSecondary} />
            </Pressable>
          ) : (
            <View style={styles.iconBtnSpacer} />
          )}
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scroll,
            {
              paddingHorizontal: horizontalPad,
              maxWidth: contentMaxWidth,
              width: contentWidth,
              alignSelf: 'center',
              paddingBottom: compact ? spacing.lg : spacing.xxl,
            },
          ]}>
          <Animated.View entering={FadeIn.duration(280)} style={styles.hero}>
            <Text style={[styles.foodName, compact && styles.foodNameCompact]} numberOfLines={2}>
              {name}
            </Text>
            <Text style={styles.portionLine} numberOfLines={2}>
              {portionLine}
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(40).duration(320)}>
            <Text style={styles.question}>{question}</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(80).duration(360)} style={styles.pickerBlock}>
            <View style={[styles.pickerFrame, { height: PICKER_H }]}>
              <View pointerEvents="none" style={styles.lens} />

              <ScrollView
                ref={scrollRef}
                showsVerticalScrollIndicator={false}
                snapToOffsets={snapOffsets}
                snapToAlignment="start"
                disableIntervalMomentum
                decelerationRate="fast"
                nestedScrollEnabled
                bounces={false}
                overScrollMode="never"
                contentContainerStyle={{ paddingVertical: ITEM_H * PAD_ROWS }}
                onScroll={onScroll}
                scrollEventThrottle={16}
                onMomentumScrollEnd={onScrollEnd}
                onScrollEndDrag={onScrollEnd}
                style={styles.pickerScroll}>
                {sizeMode
                  ? ADJUST_SIZES.map((s, i) => {
                      const selected = i === selectedIndex;
                      const dist = Math.abs(i - selectedIndex);
                      const label = formatSizeLabel(s);
                      return (
                        <Pressable
                          key={s}
                          onPress={() => selectIndex(i)}
                          style={[styles.pickerRow, { height: ITEM_H }]}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          accessibilityLabel={label}>
                          <Text
                            style={[
                              styles.pickerValue,
                              styles.pickerValueSize,
                              selected
                                ? styles.pickerValueSelected
                                : dist === 1
                                  ? styles.pickerValueNear
                                  : styles.pickerValueMuted,
                            ]}>
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })
                  : QUANTITIES.map((q, i) => {
                      const selected = i === selectedIndex;
                      const dist = Math.abs(i - selectedIndex);
                      return (
                        <Pressable
                          key={q}
                          onPress={() => selectIndex(i)}
                          style={[styles.pickerRow, { height: ITEM_H }]}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          accessibilityLabel={`${formatQuantityLabel(q)} ${unitLabel}`}>
                          <Text
                            style={[
                              styles.pickerValue,
                              selected
                                ? styles.pickerValueSelected
                                : dist === 1
                                  ? styles.pickerValueNear
                                  : styles.pickerValueMuted,
                            ]}>
                            {formatQuantityLabel(q)}
                          </Text>
                        </Pressable>
                      );
                    })}
              </ScrollView>

              <LinearGradient
                pointerEvents="none"
                colors={['rgba(12,11,16,0.96)', 'rgba(12,11,16,0)']}
                style={styles.fadeTop}
              />
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(12,11,16,0)', 'rgba(12,11,16,0.96)']}
                style={styles.fadeBot}
              />

              <View pointerEvents="none" style={styles.tickRail}>
                <View style={[styles.tick, styles.tickMuted, { top: ITEM_H * 1.5 - 1 }]} />
                <View style={[styles.tick, styles.tickSelected, { top: ITEM_H * 2.5 - 1 }]} />
                <View style={[styles.tick, styles.tickMuted, { top: ITEM_H * 3.5 - 1 }]} />
              </View>
            </View>

            <View style={styles.summaryPill}>
              <Ionicons name="sparkles" size={14} color={colors.accent} />
              <Text style={styles.summaryText}>{summaryText}</Text>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(140).duration(360)}>
            <GlassPanel emphasized style={styles.nutritionCard}>
              <View style={styles.nutritionCol}>
                <View style={styles.nutritionIconRow}>
                  <Ionicons name="barbell-outline" size={16} color={colors.accent} />
                  <Text style={styles.nutritionLabel}>Protein</Text>
                </View>
                <Text style={styles.nutritionValue}>
                  {scaledProtein < 10 ? scaledProtein.toFixed(1) : Math.round(scaledProtein)} g
                </Text>
                <Text style={styles.nutritionHint}>
                  ~{proteinLow < 10 ? proteinLow.toFixed(1) : Math.round(proteinLow)} –{' '}
                  {proteinHigh < 10 ? proteinHigh.toFixed(1) : Math.round(proteinHigh)} g
                </Text>
              </View>
              <View style={styles.nutritionDivider} />
              <View style={styles.nutritionCol}>
                <View style={styles.nutritionIconRow}>
                  <Ionicons name="flame-outline" size={16} color={colors.accent} />
                  <Text style={styles.nutritionLabel}>Calories</Text>
                </View>
                <Text style={styles.nutritionValue}>{scaledCalories} cal</Text>
                <Text style={styles.nutritionHint}>
                  ~{calLow} – {calHigh} cal
                </Text>
              </View>
            </GlassPanel>
          </Animated.View>

        </ScrollView>

        <Modal visible={deleteOpen} transparent animationType="fade" onRequestClose={() => setDeleteOpen(false)}>
          <View style={styles.confirmBackdrop}>
            <View style={styles.confirmCard}>
              <Text style={styles.confirmTitle}>Remove &quot;{name}&quot; from this meal?</Text>
              <View style={styles.confirmActions}>
                <Pressable
                  onPress={() => setDeleteOpen(false)}
                  style={[styles.confirmBtn, styles.confirmCancel, pressableWeb]}>
                  <Text style={styles.confirmCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={confirmDelete}
                  style={[styles.confirmBtn, styles.confirmDelete, pressableWeb]}>
                  <Text style={styles.confirmDeleteText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
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
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  iconBtnSpacer: {
    width: 44,
    height: 44,
  },
  titleWrap: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  topTitle: {
    fontFamily: fonts.displayHeavy,
    fontSize: 18,
    lineHeight: displayLH(18),
    color: colors.text,
    letterSpacing: -0.2,
  },
  titleAccent: {
    marginTop: 6,
    width: 36,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  scroll: {
    gap: spacing.md,
  },
  hero: {
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: 6,
  },
  foodName: {
    fontFamily: fonts.displayHeavy,
    fontSize: 34,
    lineHeight: displayLH(34),
    color: colors.text,
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  foodNameCompact: {
    fontSize: 28,
    lineHeight: displayLH(28),
  },
  portionLine: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  question: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  pickerBlock: {
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  pickerFrame: {
    width: '100%',
    maxWidth: 320,
    position: 'relative',
    overflow: 'hidden',
  },
  pickerScroll: {
    zIndex: 2,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerValue: {
    fontFamily: fonts.displayHeavy,
    fontSize: 30,
    lineHeight: ITEM_H,
    letterSpacing: -0.4,
    textAlign: 'center',
    includeFontPadding: false,
    ...(Platform.OS === 'android' ? { textAlignVertical: 'center' as const } : null),
  },
  pickerValueSize: {
    fontSize: 26,
    letterSpacing: -0.2,
  },
  pickerValueSelected: {
    color: colors.accent,
    opacity: 1,
  },
  pickerValueNear: {
    color: colors.textSecondary,
    opacity: 0.72,
  },
  pickerValueMuted: {
    color: colors.textTertiary,
    opacity: 0.38,
  },
  lens: {
    position: 'absolute',
    left: 16,
    right: 28,
    top: ITEM_H * PAD_ROWS,
    height: ITEM_H,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'rgba(255,138,61,0.45)',
    backgroundColor: 'rgba(255,138,61,0.10)',
    zIndex: 1,
  },
  fadeTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: ITEM_H * PAD_ROWS,
    zIndex: 3,
  },
  fadeBot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: ITEM_H * PAD_ROWS,
    zIndex: 3,
  },
  tickRail: {
    position: 'absolute',
    right: 6,
    top: 0,
    bottom: 0,
    width: 16,
    zIndex: 3,
  },
  tick: {
    position: 'absolute',
    right: 0,
    height: 2,
    borderRadius: 1,
  },
  tickSelected: {
    width: 14,
    backgroundColor: colors.accent,
  },
  tickMuted: {
    width: 8,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  summaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  summaryText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textSecondary,
  },
  nutritionCard: {
    flexDirection: 'row',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  nutritionCol: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  nutritionDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginVertical: 4,
  },
  nutritionIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nutritionLabel: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textSecondary,
  },
  nutritionValue: {
    fontFamily: fonts.displayHeavy,
    fontSize: 28,
    lineHeight: displayLH(28),
    color: colors.text,
    letterSpacing: -0.4,
  },
  nutritionHint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textTertiary,
  },
  confirmBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineBright,
    padding: spacing.lg,
    gap: spacing.md,
  },
  confirmTitle: {
    fontFamily: fonts.displayMedium,
    fontSize: 17,
    color: colors.text,
    textAlign: 'center',
  },
  confirmActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  confirmBtn: {
    flex: 1,
    height: 46,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancel: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  confirmCancelText: {
    fontFamily: fonts.displayMedium,
    fontSize: 15,
    color: colors.text,
  },
  confirmDelete: {
    backgroundColor: '#E25555',
  },
  confirmDeleteText: {
    fontFamily: fonts.displayMedium,
    fontSize: 15,
    color: '#fff',
  },
});
