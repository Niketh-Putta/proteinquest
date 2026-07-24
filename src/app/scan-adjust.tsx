import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
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
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GlassPanel } from '@/components/GlassPanel';
import { PageCanvas } from '@/components/PageCanvas';
import { useContentColumn } from '@/lib/layout';
import {
  parseNutritionNumber,
  sanitizeNutritionDraft,
} from '@/lib/parse-nutrition-number';
import {
  ADJUST_SIZES,
  ADJUST_SIZE_SCALE,
  AdjustSize,
  buildAdjustQuestion,
  buildSizePortion,
  formatAdjustWheelUnit,
  formatCountUnitLabel,
  formatQuantityLabel,
  formatSizeLabel,
  parsePortionQuantity,
  parsePortionSize,
  resolveAdjustCountUnit,
  flushPendingIngredientEdit,
  resolveAdjustQuantityMode,
  setPendingIngredientEdit,
} from '@/lib/scan-ingredient-edit';
import { colors, displayLH, fonts, pressableWeb, spacing } from '@/theme';

/** 0 → 15 in quarter steps (0.25, 0.5, 0.75, …). */
const QUANTITIES = Array.from({ length: 61 }, (_, i) => i * 0.25);
const ITEM_H = 48;
const VISIBLE_ROWS = 5;
const PICKER_H = ITEM_H * VISIBLE_ROWS;
const PAD_ROWS = 2;
const GRAM_STEP = 5;
const TOGGLE_PAD = 4;
const TOGGLE_H = 52;

const glassSoft =
  Platform.OS === 'web'
    ? ({
        backdropFilter: 'blur(18px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(18px) saturate(1.4)',
      } as const)
    : null;

const glassStrong =
  Platform.OS === 'web'
    ? ({
        backdropFilter: 'blur(28px) saturate(1.55)',
        WebkitBackdropFilter: 'blur(28px) saturate(1.55)',
      } as const)
    : null;

type InputMode = 'unit' | 'grams';

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

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Fallback density when AI did not send grams. */
function defaultGramsPerUnit(unit: string): number {
  const u = unit.toLowerCase();
  if (/tablespoon|tbsp/.test(u)) return 14;
  if (/teaspoon|tsp/.test(u)) return 5;
  if (/spoonful|spoon/.test(u)) return 15;
  if (/glass/.test(u)) return 240;
  if (/cup/.test(u)) return 150;
  if (/bowl/.test(u)) return 250;
  if (/plate/.test(u)) return 300;
  if (/ladle/.test(u)) return 60;
  if (/scoop/.test(u)) return 30;
  if (/slice/.test(u)) return 30;
  if (/spear/.test(u)) return 15;
  if (/stick/.test(u)) return 20;
  if (/floret/.test(u)) return 35;
  if (/handful/.test(u)) return 40;
  if (/piece/.test(u)) return 50;
  if (/drizzle/.test(u)) return 5;
  return 100;
}

function unitToggleIcon(unit: string): keyof typeof Ionicons.glyphMap {
  const u = unit.toLowerCase();
  if (/glass/.test(u)) return 'wine-outline';
  if (/cup/.test(u)) return 'cafe-outline';
  if (/bowl|plate|ladle/.test(u)) return 'restaurant-outline';
  if (/tablespoon|teaspoon|spoon|drizzle/.test(u)) return 'water-outline';
  if (/scoop/.test(u)) return 'ice-cream-outline';
  if (/slice|piece|spear|stick|floret|handful/.test(u)) return 'nutrition-outline';
  return 'cube-outline';
}

function qtyFromGrams(grams: number, gramsPerUnit: number): number {
  if (gramsPerUnit <= 0) return 1;
  return Math.max(0, grams / gramsPerUnit);
}

function formatApproxQty(qty: number): string {
  if (qty <= 0) return '0';
  if (qty < 0.05) return '<0.1';
  if (Math.abs(qty - Math.round(qty)) < 0.05) return String(Math.round(qty));
  const quarter = Math.round(qty * 4) / 4;
  if (Math.abs(qty - quarter) < 0.05) return formatQuantityLabel(quarter);
  return (Math.round(qty * 10) / 10).toFixed(1).replace(/\.0$/, '');
}

export default function ScanAdjustScreen() {
  const navigation = useNavigation();
  const column = useContentColumn('form');
  const { height: winH } = useWindowDimensions();
  const compact = winH < 720;
  const flushedOnLeaveRef = useRef(false);
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

  const countUnit = useMemo(
    () => resolveAdjustCountUnit(name, initialPortion),
    [name, initialPortion],
  );
  const unitSingular = formatCountUnitLabel(countUnit, 1);
  const unitPlural = formatCountUnitLabel(countUnit, 2);
  const unitToggleLabel = capitalize(unitPlural);
  const measureIcon = unitToggleIcon(countUnit);

  const { qty: parsedQty } = useMemo(
    () => parsePortionQuantity(initialPortion),
    [initialPortion],
  );
  const baseQty = isAdd ? 1 : parsedQty > 0 ? parsedQty : 1;
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
  const gramsPerUnit = useMemo(() => {
    if (isAdd && baseGrams != null && baseGrams > 0) return baseGrams;
    if (baseGrams != null && baseQty > 0) return baseGrams / baseQty;
    return defaultGramsPerUnit(countUnit);
  }, [isAdd, baseGrams, baseQty, countUnit]);

  const options = sizeMode ? ADJUST_SIZES : QUANTITIES;
  const snapOffsets = useMemo(
    () => options.map((_, i) => i * ITEM_H),
    [options],
  );

  const initialIndex = sizeMode
    ? Math.max(0, ADJUST_SIZES.indexOf(isAdd ? 'medium' : initialSize))
    : nearestQuantityIndex(isAdd ? 1 : baseQty);

  const [inputMode, setInputMode] = useState<InputMode>('unit');
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const [gramsValue, setGramsValue] = useState(() => {
    if (baseGrams != null) return Math.max(0, Math.round(baseGrams));
    const q = sizeMode ? 1 : (QUANTITIES[initialIndex] ?? 1);
    return Math.max(0, Math.round(gramsPerUnit * q));
  });
  const [gramsDraft, setGramsDraft] = useState('');
  const [toggleTrackW, setToggleTrackW] = useState(0);
  const toggleSlide = useSharedValue(0);
  const toggleThumbW = useSharedValue(0);
  const scrollRef = useRef<ScrollView>(null);
  const selectedIndexRef = useRef(initialIndex);
  const lastOffsetYRef = useRef(initialIndex * ITEM_H);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProgrammaticSnapRef = useRef(false);

  useEffect(() => {
    if (toggleTrackW <= 0) return;
    const nextW = (toggleTrackW - TOGGLE_PAD * 2) / 2;
    toggleThumbW.value = nextW;
    toggleSlide.value = withSpring(inputMode === 'unit' ? 0 : nextW, {
      damping: 18,
      stiffness: 280,
      mass: 0.65,
    });
  }, [inputMode, toggleTrackW, toggleSlide, toggleThumbW]);

  const toggleThumbStyle = useAnimatedStyle(() => ({
    width: toggleThumbW.value,
    transform: [{ translateX: toggleSlide.value }],
  }));

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

  const unitGrams = Math.max(
    0,
    Math.round(sizeMode ? gramsPerUnit * sizeScale : gramsPerUnit * qty),
  );
  const activeGrams = inputMode === 'grams' ? Math.max(0, Math.round(gramsValue)) : unitGrams;
  const approxQtyFromGrams = qtyFromGrams(activeGrams, gramsPerUnit);

  const proteinPerGram =
    gramsPerUnit > 0 ? (sizeMode ? baseProtein / gramsPerUnit : proteinPerUnit / gramsPerUnit) : null;
  const caloriesPerGram =
    gramsPerUnit > 0
      ? (sizeMode ? baseCalories / gramsPerUnit : caloriesPerUnit / gramsPerUnit)
      : null;

  const scaledProtein =
    inputMode === 'grams' && proteinPerGram != null
      ? roundProtein(proteinPerGram * activeGrams)
      : roundProtein(sizeMode ? baseProtein * sizeScale : proteinPerUnit * qty);
  const scaledCalories =
    inputMode === 'grams' && caloriesPerGram != null
      ? Math.max(0, Math.round(caloriesPerGram * activeGrams))
      : Math.max(
          0,
          Math.round(sizeMode ? baseCalories * sizeScale : caloriesPerUnit * qty),
        );

  const unitLabel = formatAdjustWheelUnit(name, initialPortion, qty === 0 ? 2 : qty);
  const questionUnit = useMemo(
    () => buildAdjustQuestion(name, initialPortion, mode),
    [name, initialPortion, mode],
  );
  const questionGrams = `Enter the exact weight of ${name.trim().toLowerCase() || 'this food'} you had.`;

  const proteinLow = roundProtein(scaledProtein * 0.75);
  const proteinHigh = roundProtein(scaledProtein * 1.25);
  const calLow = Math.max(0, Math.round(scaledCalories * 0.8));
  const calHigh = Math.max(0, Math.round(scaledCalories * 1.2));

  const heroSubtitle = `~${Math.round(gramsPerUnit)}g per 1 ${unitSingular}`;
  const conversionBadge =
    inputMode === 'unit'
      ? `1 ${unitSingular} ≈ ${Math.round(gramsPerUnit)} g`
      : `${activeGrams} g ≈ ${formatApproxQty(approxQtyFromGrams)} ${formatCountUnitLabel(countUnit, approxQtyFromGrams)}`;

  const estimatedLabel = inputMode === 'unit' ? 'Estimated mass' : `Estimated ${unitPlural}`;
  const estimatedValue =
    inputMode === 'unit'
      ? `≈ ${activeGrams} g`
      : `≈ ${formatApproxQty(approxQtyFromGrams)} ${formatCountUnitLabel(countUnit, approxQtyFromGrams)}`;

  const gramsHint =
    inputMode === 'unit'
      ? `Protein and calories are estimated based on ~${activeGrams}g.`
      : `Protein and calories are estimated based on ${activeGrams}g.`;

  const gramsFieldValue = gramsDraft !== '' ? gramsDraft : String(activeGrams);

  function indexFromOffset(y: number) {
    return Math.max(0, Math.min(options.length - 1, Math.round(y / ITEM_H)));
  }

  function buildPortionFromUnit(nextQty: number, nextSize: AdjustSize): string {
    if (sizeMode) return buildSizePortion(nextSize, name);
    if (nextQty === 0) return 'none';
    return `${formatQuantityLabel(nextQty)} ${formatAdjustWheelUnit(name, initialPortion, nextQty)}`.trim();
  }

  function buildEdit(next: {
    i: number;
    mode: InputMode;
    grams: number;
  }) {
    const nextQty = sizeMode ? 1 : (QUANTITIES[next.i] ?? 1);
    const nextSize: AdjustSize = sizeMode
      ? (ADJUST_SIZES[next.i] ?? 'medium')
      : 'medium';
    const scale = sizeMode ? ADJUST_SIZE_SCALE[nextSize] : nextQty;

    let protein: number;
    let calories: number;
    let grams: number;
    let portion: string;

    if (next.mode === 'grams') {
      grams = Math.max(0, Math.round(next.grams));
      protein =
        proteinPerGram != null
          ? roundProtein(proteinPerGram * grams)
          : roundProtein(sizeMode ? baseProtein * scale : proteinPerUnit * nextQty);
      calories =
        caloriesPerGram != null
          ? Math.max(0, Math.round(caloriesPerGram * grams))
          : Math.max(
              0,
              Math.round(sizeMode ? baseCalories * scale : caloriesPerUnit * nextQty),
            );
      portion = grams <= 0 ? 'none' : `${grams} g`;
    } else {
      protein = roundProtein(sizeMode ? baseProtein * scale : proteinPerUnit * nextQty);
      calories = Math.max(
        0,
        Math.round(sizeMode ? baseCalories * scale : caloriesPerUnit * nextQty),
      );
      grams = Math.max(0, Math.round(sizeMode ? gramsPerUnit * scale : gramsPerUnit * nextQty));
      portion = buildPortionFromUnit(nextQty, nextSize);
    }

    return {
      index,
      name: name.trim() || 'Ingredient',
      portion,
      protein_g: protein,
      calories_g: calories,
      estimated_grams: grams > 0 ? grams : undefined,
    };
  }

  function persist(next: { i: number; mode: InputMode; grams: number }) {
    setPendingIngredientEdit({
      ...buildEdit(next),
      action: isAdd ? 'add' : 'update',
    });
  }

  function persistLatest() {
    if (inputMode === 'grams' && gramsDraft !== '') {
      const n = parseNutritionNumber(gramsDraft);
      if (n != null && n >= 0) {
        persist({
          i: selectedIndexRef.current,
          mode: 'grams',
          grams: Math.round(n),
        });
        return;
      }
    }
    persist({
      i: selectedIndexRef.current,
      mode: inputMode,
      grams: inputMode === 'grams' ? gramsValue : unitGrams,
    });
  }

  function commitAndFlush() {
    persistLatest();
    flushedOnLeaveRef.current = true;
    flushPendingIngredientEdit();
  }

  // Gesture / browser back: still commit the latest pending edit.
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', () => {
      if (flushedOnLeaveRef.current) return;
      if (isAdd || selectedIndexRef.current >= 0) {
        persistLatest();
      }
      flushPendingIngredientEdit();
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- leave uses latest refs/state via closure refresh on deps
  }, [navigation, isAdd, inputMode, gramsDraft, gramsValue, unitGrams, index, name, initialPortion]);

  // Seed pending add so back / leave commits even if untouched.
  useEffect(() => {
    if (!isAdd) return;
    persist({
      i: initialIndex,
      mode: 'unit',
      grams: Math.max(0, Math.round(gramsPerUnit * (QUANTITIES[initialIndex] ?? 1))),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdd, initialIndex, name, initialPortion]);

  function applyIndex(i: number, haptic: boolean) {
    const changed = i !== selectedIndexRef.current;
    const nextQty = sizeMode ? 1 : (QUANTITIES[i] ?? 1);
    const nextSize: AdjustSize = sizeMode
      ? (ADJUST_SIZES[i] ?? 'medium')
      : 'medium';
    const scale = sizeMode ? ADJUST_SIZE_SCALE[nextSize] : nextQty;
    const g = Math.max(0, Math.round(gramsPerUnit * scale));

    if (changed) {
      selectedIndexRef.current = i;
      setSelectedIndex(i);
      setGramsValue(g);
      setGramsDraft('');
      if (haptic) Haptics.selectionAsync().catch(() => {});
    }
    persist({ i, mode: 'unit', grams: g });
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
      const nextQty = sizeMode ? 1 : (QUANTITIES[i] ?? 1);
      const nextSize: AdjustSize = sizeMode
        ? (ADJUST_SIZES[i] ?? 'medium')
        : 'medium';
      const scale = sizeMode ? ADJUST_SIZE_SCALE[nextSize] : nextQty;
      setGramsValue(Math.max(0, Math.round(gramsPerUnit * scale)));
      setGramsDraft('');
    }
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

  function switchInputMode(next: InputMode) {
    if (next === inputMode) return;
    Haptics.selectionAsync().catch(() => {});
    if (next === 'grams') {
      setGramsValue(unitGrams);
      setGramsDraft('');
      setInputMode('grams');
      persist({ i: selectedIndexRef.current, mode: 'grams', grams: unitGrams });
      return;
    }
    // grams → unit: snap wheel to nearest qty matching current grams
    const q = qtyFromGrams(gramsValue, gramsPerUnit);
    const i = nearestQuantityIndex(q);
    selectedIndexRef.current = i;
    setSelectedIndex(i);
    setInputMode('unit');
    const snappedG = Math.max(0, Math.round(gramsPerUnit * (QUANTITIES[i] ?? 1)));
    setGramsValue(snappedG);
    setGramsDraft('');
    persist({ i, mode: 'unit', grams: snappedG });
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: i * ITEM_H, animated: true });
    });
  }

  function commitGrams(raw: string) {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed) {
      setGramsValue(0);
      setGramsDraft('');
      persist({ i: selectedIndexRef.current, mode: 'grams', grams: 0 });
      return;
    }
    const n = parseNutritionNumber(trimmed);
    if (n == null || n < 0) return;
    const rounded = Math.round(n);
    setGramsValue(rounded);
    setGramsDraft('');
    persist({ i: selectedIndexRef.current, mode: 'grams', grams: rounded });
  }

  function stepGrams(delta: number) {
    const next = Math.max(0, Math.round(gramsValue + delta));
    setGramsValue(next);
    setGramsDraft('');
    Haptics.selectionAsync().catch(() => {});
    persist({ i: selectedIndexRef.current, mode: 'grams', grams: next });
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/scan');
  }

  /** Leave without router.dismiss (throws POP toast on web). */
  function leaveScreen() {
    if (!isAdd) {
      goBack();
      return;
    }
    // Add flow: scan → scan-ingredient → scan-adjust.
    if (router.canGoBack()) {
      router.back();
      requestAnimationFrame(() => {
        if (router.canGoBack()) router.back();
      });
      return;
    }
    router.replace('/scan');
  }

  function saveAndBack() {
    // Apply into the parent list before navigating back. useFocusEffect alone is
    // unreliable on web when scan/meal stay "focused" under the adjust card.
    commitAndFlush();
    leaveScreen();
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
    flushedOnLeaveRef.current = true;
    flushPendingIngredientEdit();
    goBack();
  }

  return (
    <PageCanvas>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={[styles.topBar, column]}>
          <View style={styles.topBarSide}>
            <Pressable
              onPress={saveAndBack}
              hitSlop={10}
              style={({ pressed }) => [
                styles.backBtn,
                pressableWeb,
                pressed && styles.backBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Back">
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.04)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <Ionicons name="chevron-back" size={20} color={colors.text} />
            </Pressable>
          </View>
          <View style={[styles.titleWrap, { minWidth: 0, flexShrink: 1 }]}>
            <Text
              style={styles.topTitle}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
              ellipsizeMode="tail">
              {isAdd ? `Add ${name}` : `Adjust ${name}`}
            </Text>
            <View style={styles.titleAccent} />
          </View>
          <View style={[styles.topBarSide, styles.topBarSideRight]}>
            {!isAdd ? (
              <Pressable
                onPress={() => setDeleteOpen(true)}
                hitSlop={10}
                style={({ pressed }) => [
                  styles.backBtn,
                  pressableWeb,
                  pressed && styles.backBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${name}`}>
                <LinearGradient
                  pointerEvents="none"
                  colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.03)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.scroll,
            column,
            { paddingBottom: compact ? spacing.lg : spacing.xxl },
          ]}>
          <Animated.View entering={FadeIn.duration(280)} style={styles.hero}>
            <Text style={[styles.foodName, compact && styles.foodNameCompact]} numberOfLines={2}>
              {name}
            </Text>
            <Text style={styles.portionLine}>{heroSubtitle}</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(40).duration(320)} style={styles.toggleBlock}>
            <Text style={styles.togglePrompt}>How do you want to measure?</Text>
            <View
              style={[styles.toggleTrack, glassStrong]}
              onLayout={(e) => setToggleTrackW(e.nativeEvent.layout.width)}>
              <Animated.View style={[styles.toggleThumb, toggleThumbStyle]}>
                <LinearGradient
                  colors={['rgba(255,122,89,0.38)', 'rgba(255,122,89,0.16)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
              <Pressable
                onPress={() => switchInputMode('unit')}
                style={styles.toggleSide}
                accessibilityRole="button"
                accessibilityState={{ selected: inputMode === 'unit' }}
                accessibilityLabel={`Measure in ${unitPlural}`}>
                <Ionicons
                  name={measureIcon}
                  size={18}
                  color={inputMode === 'unit' ? colors.accent : colors.textTertiary}
                />
                <Text
                  style={[
                    styles.toggleChipText,
                    inputMode === 'unit' && styles.toggleChipTextActive,
                  ]}>
                  {unitToggleLabel}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => switchInputMode('grams')}
                style={styles.toggleSide}
                accessibilityRole="button"
                accessibilityState={{ selected: inputMode === 'grams' }}
                accessibilityLabel="Measure in grams">
                <Ionicons
                  name="scale-outline"
                  size={18}
                  color={inputMode === 'grams' ? colors.accent : colors.textTertiary}
                />
                <Text
                  style={[
                    styles.toggleChipText,
                    inputMode === 'grams' && styles.toggleChipTextActive,
                  ]}>
                  Grams
                </Text>
              </Pressable>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(70).duration(320)}>
            <Text style={styles.question}>
              {inputMode === 'unit' ? questionUnit : questionGrams}
            </Text>
          </Animated.View>

          {inputMode === 'unit' ? (
            <Animated.View entering={FadeInDown.delay(90).duration(360)} style={styles.pickerBlock}>
              <View style={[styles.pickerShell, glassSoft]}>
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
                    colors={['rgba(14,12,18,0.95)', 'rgba(14,12,18,0)']}
                    style={styles.fadeTop}
                  />
                  <LinearGradient
                    pointerEvents="none"
                    colors={['rgba(14,12,18,0)', 'rgba(14,12,18,0.95)']}
                    style={styles.fadeBot}
                  />
                  <View pointerEvents="none" style={styles.tickRail}>
                    <View style={[styles.tick, styles.tickMuted, { top: ITEM_H * 1.5 - 1 }]} />
                    <View style={[styles.tick, styles.tickSelected, { top: ITEM_H * 2.5 - 1 }]} />
                    <View style={[styles.tick, styles.tickMuted, { top: ITEM_H * 3.5 - 1 }]} />
                  </View>
                </View>
              </View>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeInDown.delay(90).duration(360)} style={styles.gramsModeBlock}>
              <View style={styles.gramsStepperRow}>
                <Pressable
                  onPress={() => stepGrams(-GRAM_STEP)}
                  style={({ pressed }) => [
                    styles.stepBtn,
                    pressableWeb,
                    pressed && styles.stepBtnPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Decrease by ${GRAM_STEP} grams`}>
                  <LinearGradient
                    pointerEvents="none"
                    colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.03)']}
                    start={{ x: 0.2, y: 0 }}
                    end={{ x: 0.8, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <Ionicons name="remove" size={22} color={colors.text} />
                </Pressable>
                <View style={styles.gramsValueBox}>
                  <LinearGradient
                    pointerEvents="none"
                    colors={['rgba(255,122,89,0.16)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.02)']}
                    locations={[0, 0.45, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <View pointerEvents="none" style={styles.glassSheen} />
                  <TextInput
                    value={gramsFieldValue}
                    onChangeText={(t) => setGramsDraft(sanitizeNutritionDraft(t))}
                    onBlur={() => commitGrams(gramsDraft !== '' ? gramsDraft : gramsFieldValue)}
                    onSubmitEditing={() =>
                      commitGrams(gramsDraft !== '' ? gramsDraft : gramsFieldValue)
                    }
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    style={styles.gramsValueInput}
                    accessibilityLabel="Mass in grams"
                  />
                  <Text style={styles.gramsValueUnit}>grams</Text>
                </View>
                <Pressable
                  onPress={() => stepGrams(GRAM_STEP)}
                  style={({ pressed }) => [
                    styles.stepBtn,
                    pressableWeb,
                    pressed && styles.stepBtnPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Increase by ${GRAM_STEP} grams`}>
                  <LinearGradient
                    pointerEvents="none"
                    colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.03)']}
                    start={{ x: 0.2, y: 0 }}
                    end={{ x: 0.8, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <Ionicons name="add" size={22} color={colors.text} />
                </Pressable>
              </View>
            </Animated.View>
          )}

          <Animated.View entering={FadeInDown.delay(120).duration(320)} style={styles.estimateBlock}>
            <View style={styles.conversionPill}>
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(255,122,89,0.18)', 'rgba(255,255,255,0.05)']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
              <Ionicons name="sparkles" size={13} color={colors.accent} />
              <Text style={styles.conversionText}>{conversionBadge}</Text>
            </View>
            <Text style={styles.estimateLabel}>{estimatedLabel}</Text>
            <View style={styles.estimateBox}>
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.03)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View pointerEvents="none" style={styles.glassSheen} />
              <Text style={styles.estimateValue}>{estimatedValue}</Text>
            </View>
            <Text style={styles.gramsHint}>{gramsHint}</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(150).duration(360)}>
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

        <Modal
          visible={deleteOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setDeleteOpen(false)}>
          <View style={styles.confirmRoot}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
              style={styles.confirmBackdrop}
              onPress={() => setDeleteOpen(false)}
            />
            <View style={styles.confirmCardWrap}>
              <GlassPanel emphasized style={styles.confirmCard}>
                <View pointerEvents="none" style={styles.confirmSheen} />
                <Text style={styles.confirmTitle}>Remove &quot;{name}&quot; from this meal?</Text>
                <View style={styles.confirmActions}>
                  <Pressable
                    onPress={() => setDeleteOpen(false)}
                    style={[styles.confirmBtn, styles.confirmCancel, pressableWeb]}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel">
                    <Text style={styles.confirmCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={confirmDelete}
                    style={[styles.confirmBtn, styles.confirmDelete, pressableWeb]}
                    accessibilityRole="button"
                    accessibilityLabel="Delete">
                    <Text style={styles.confirmDeleteText}>Delete</Text>
                  </Pressable>
                </View>
              </GlassPanel>
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
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    minHeight: 56,
  },
  topBarSide: {
    width: 48,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  topBarSideRight: {
    alignItems: 'flex-end',
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(22, 20, 28, 0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(18px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(18px) saturate(1.4)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
        } as object)
      : {
          shadowColor: '#000',
          shadowOpacity: 0.28,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
        }),
  },
  backBtnPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.96 }],
  },
  titleWrap: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  topTitle: {
    fontFamily: fonts.displayHeavy,
    fontSize: 17,
    lineHeight: displayLH(17),
    color: colors.text,
    letterSpacing: -0.2,
  },
  titleAccent: {
    marginTop: 6,
    width: 28,
    height: 2.5,
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
  toggleBlock: {
    gap: 12,
    marginTop: spacing.xs,
  },
  togglePrompt: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  toggleTrack: {
    flexDirection: 'row',
    height: TOGGLE_H,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
    padding: TOGGLE_PAD,
    position: 'relative',
    overflow: 'hidden',
  },
  toggleThumb: {
    position: 'absolute',
    top: TOGGLE_PAD,
    left: TOGGLE_PAD,
    height: TOGGLE_H - TOGGLE_PAD * 2,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,122,89,0.95)',
    backgroundColor: 'rgba(255,122,89,0.22)',
  },
  toggleSide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    zIndex: 2,
  },
  toggleChipText: {
    fontFamily: fonts.displayHeavy,
    fontSize: 15,
    color: colors.textTertiary,
  },
  toggleChipTextActive: {
    color: colors.accent,
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
    marginTop: spacing.xs,
  },
  pickerShell: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 8,
    paddingHorizontal: 6,
    overflow: 'hidden',
  },
  pickerFrame: {
    width: '100%',
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
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,122,89,0.85)',
    backgroundColor: 'rgba(255,122,89,0.08)',
    zIndex: 1,
  },
  fadeTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: ITEM_H * 1.6,
    zIndex: 3,
  },
  fadeBot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: ITEM_H * 1.6,
    zIndex: 3,
  },
  tickRail: {
    position: 'absolute',
    right: 8,
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
  gramsModeBlock: {
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  gramsStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    maxWidth: 360,
    justifyContent: 'center',
  },
  stepBtn: {
    width: 52,
    height: 72,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(24, 22, 30, 0.78)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(22px) saturate(1.45)',
          WebkitBackdropFilter: 'blur(22px) saturate(1.45)',
          boxShadow: '0 10px 28px rgba(0,0,0,0.32)',
        } as object)
      : {
          shadowColor: '#000',
          shadowOpacity: 0.3,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 8 },
        }),
  },
  stepBtnPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
  gramsValueBox: {
    flex: 1,
    maxWidth: 210,
    minHeight: 108,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(28, 24, 36, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,122,89,0.28)',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(28px) saturate(1.55)',
          WebkitBackdropFilter: 'blur(28px) saturate(1.55)',
          boxShadow: '0 14px 40px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.12)',
        } as object)
      : {
          shadowColor: '#FF7A59',
          shadowOpacity: 0.12,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 10 },
        }),
  },
  glassSheen: {
    position: 'absolute',
    top: 0,
    left: 12,
    right: 12,
    height: StyleSheet.hairlineWidth * 2,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.28)',
    opacity: 0.7,
  },
  gramsValueInput: {
    minWidth: 88,
    width: '100%',
    fontFamily: fonts.displayHeavy,
    fontSize: 42,
    lineHeight: 48,
    color: colors.text,
    textAlign: 'center',
    padding: 0,
    zIndex: 1,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  gramsValueUnit: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    zIndex: 1,
  },
  estimateBlock: {
    alignItems: 'center',
    gap: 10,
    marginTop: spacing.xs,
  },
  conversionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(24, 22, 30, 0.7)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,122,89,0.35)',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(18px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(18px) saturate(1.4)',
        } as object)
      : null),
  },
  conversionText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textSecondary,
    zIndex: 1,
  },
  estimateLabel: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
    letterSpacing: 0.2,
  },
  estimateBox: {
    minWidth: 180,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(28, 24, 36, 0.7)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(24px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.5)',
          boxShadow: '0 12px 32px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.1)',
        } as object)
      : {
          shadowColor: '#000',
          shadowOpacity: 0.28,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
        }),
  },
  estimateValue: {
    fontFamily: fonts.displayHeavy,
    fontSize: 22,
    lineHeight: displayLH(22),
    color: colors.text,
    zIndex: 1,
  },
  gramsHint: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textTertiary,
    textAlign: 'center',
    maxWidth: 280,
  },
  nutritionCard: {
    flexDirection: 'row',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: 16,
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
  confirmRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  confirmBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(6, 5, 10, 0.4)',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(6px) saturate(1.15)',
          WebkitBackdropFilter: 'blur(6px) saturate(1.15)',
        } as object)
      : null),
  },
  confirmCardWrap: {
    width: '100%',
    maxWidth: 340,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 28px 64px rgba(0,0,0,0.55), 0 0 48px rgba(255,122,89,0.12)',
        } as object)
      : {
          shadowColor: '#000',
          shadowOpacity: 0.45,
          shadowRadius: 28,
          shadowOffset: { width: 0, height: 16 },
          elevation: 20,
        }),
  },
  confirmCard: {
    position: 'relative',
    padding: spacing.lg,
    gap: spacing.md,
    borderRadius: 14,
    backgroundColor: 'rgba(22, 20, 30, 0.42)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
  },
  confirmSheen: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.28)',
  },
  confirmTitle: {
    fontFamily: fonts.displayHeavy,
    fontSize: 18,
    lineHeight: displayLH(18),
    color: colors.text,
    textAlign: 'center',
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 10,
  },
  confirmBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
  },
  confirmCancel: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  confirmCancelText: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.textSecondary,
  },
  confirmDelete: {
    backgroundColor: colors.accent,
  },
  confirmDeleteText: {
    fontFamily: fonts.displayHeavy,
    fontSize: 15,
    color: '#1A0F0C',
  },
});
