import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useDeferredValue, useEffect, useMemo, useState, startTransition } from 'react';
import {
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

import { GlassPanel } from '@/components/GlassPanel';
import { PageCanvas } from '@/components/PageCanvas';
import {
  allCatalogFoods,
  commonCatalogFoods,
  type CatalogFood,
  filterRecentCatalogFoods,
  loadRecentFoods,
  pushRecentFood,
  refreshRemoteFoodCatalog,
  searchCatalogExact,
  searchCatalogSimilar,
} from '@/lib/food-catalog';
import { useContentColumn } from '@/lib/layout';
import { colors, fonts, layout, pressableWeb, radius, spacing, textInputWeb } from '@/theme';

function openAdjust(food: CatalogFood) {
  void pushRecentFood(food);
  const q = new URLSearchParams({
    index: '-1',
    name: food.name,
    portion: food.portion || '1 serving',
    protein: String(food.protein_g),
    calories: String(food.calories_g),
    mode: 'add',
  });
  if (food.estimated_grams != null) q.set('grams', String(food.estimated_grams));
  router.push(`/scan-adjust?${q.toString()}` as never);
}

function SectionLabel({ label }: { label: string }) {
  return (
    <View style={styles.sectionLabelRow}>
      <View style={styles.sectionRule} />
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.sectionRule} />
    </View>
  );
}

function FoodRow({
  food,
  icon,
  isLast,
}: {
  food: CatalogFood;
  icon: keyof typeof Ionicons.glyphMap;
  isLast: boolean;
}) {
  return (
    <Pressable
      onPress={() => openAdjust(food)}
      style={({ pressed }) => [
        styles.foodRow,
        !isLast && styles.foodRowBorder,
        pressableWeb,
        pressed && { opacity: 0.85 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Add ${food.name}`}>
      <View style={styles.foodIcon}>
        <Ionicons name={icon} size={16} color={colors.accent} />
      </View>
      <Text style={styles.foodName} numberOfLines={1}>
        {food.name}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
    </Pressable>
  );
}

const BROWSE_PAGE = 100;

export default function ScanIngredientScreen() {
  const column = useContentColumn('form');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [recent, setRecent] = useState<CatalogFood[]>([]);
  const [browseLimit, setBrowseLimit] = useState(BROWSE_PAGE);
  const [catalogTick, setCatalogTick] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void loadRecentFoods().then((list) => {
        if (alive) setRecent(list);
      });
      // Pull remote catalogue (no app rebuild needed when you add rows in Supabase).
      void refreshRemoteFoodCatalog().then(() => {
        if (alive) setCatalogTick((n) => n + 1);
      });
      return () => {
        alive = false;
      };
    }, []),
  );

  const trimmedQuery = query.trim();
  const deferredTrimmed = deferredQuery.trim();
  const searching = trimmedQuery.length > 0;
  const searchPending = searching && deferredTrimmed !== trimmedQuery;

  /** Recent list is tiny — filter on every keystroke for instant feedback. */
  const recentMatches = useMemo(
    () => (searching ? filterRecentCatalogFoods(recent, trimmedQuery) : []),
    [searching, recent, trimmedQuery],
  );

  const exactResults = useMemo(() => {
    if (!deferredTrimmed) return [];
    return searchCatalogExact(deferredTrimmed);
  }, [deferredTrimmed, catalogTick]);

  const [similarResults, setSimilarResults] = useState<CatalogFood[]>([]);

  useEffect(() => {
    if (!deferredTrimmed) {
      setSimilarResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      startTransition(() => {
        if (cancelled) return;
        setSimilarResults(searchCatalogSimilar(deferredTrimmed, exactResults));
      });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [deferredTrimmed, exactResults, catalogTick]);

  const commonBase = useMemo(() => commonCatalogFoods(), [catalogTick]);

  const common = useMemo(() => {
    const recentNames = new Set(recent.map((r) => r.name.toLowerCase()));
    return commonBase.filter((f) => !recentNames.has(f.name.toLowerCase()));
  }, [recent, commonBase]);

  /** Full catalogue browse under COMMON so users can keep scrolling. Skip while searching. */
  const browseMore = useMemo(() => {
    if (searching) return [] as CatalogFood[];
    const skip = new Set([
      ...recent.map((r) => r.name.toLowerCase()),
      ...commonBase.map((f) => f.name.toLowerCase()),
    ]);
    return allCatalogFoods()
      .filter((f) => !skip.has(f.name.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [searching, recent, commonBase, catalogTick]);

  const browseVisible = browseMore.slice(0, browseLimit);
  const browseRemaining = Math.max(0, browseMore.length - browseLimit);

  const loadMoreBrowse = useCallback(() => {
    setBrowseLimit((n) => Math.min(n + BROWSE_PAGE, browseMore.length));
  }, [browseMore.length]);

  return (
    <PageCanvas>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={[styles.page, column]}>
          <View style={styles.topBar}>
            <Pressable
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace('/scan');
              }}
              hitSlop={12}
              style={({ pressed }) => [styles.iconBtn, pressableWeb, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel="Back">
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </Pressable>
            <Text
              style={[styles.topTitle, { flexShrink: 1, minWidth: 0, textAlign: 'center' }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}>
              ADD INGREDIENT
            </Text>
            <View style={styles.iconBtnSpacer} />
          </View>

          <ScrollView
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
            style={styles.scrollView}
            contentContainerStyle={styles.scroll}
            scrollEventThrottle={160}
            onScroll={(e) => {
              if (searching || browseRemaining <= 0) return;
              const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
              if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 480) {
                loadMoreBrowse();
              }
            }}>
          <Animated.View entering={FadeIn.duration(240)} style={styles.searchWrap}>
            <View style={styles.searchIcon} pointerEvents="none">
              <Ionicons name="search" size={18} color={colors.textTertiary} />
            </View>
            <TextInput
              style={[styles.searchInput, textInputWeb]}
              value={query}
              onChangeText={setQuery}
              placeholder="Search food or ingredient..."
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="sentences"
              autoCorrect
              autoFocus
              returnKeyType="search"
              clearButtonMode="while-editing"
              accessibilityLabel="Search food"
            />
          </Animated.View>

          {searching ? (
            <Animated.View entering={FadeInDown.duration(280)} style={styles.searchResults}>
              {searchPending && exactResults.length === 0 && similarResults.length === 0 ? (
                <Text style={styles.searchPending}>Searching…</Text>
              ) : null}
              {recentMatches.length > 0 ? (
                <>
                  <SectionLabel label="RECENT" />
                  <GlassPanel style={styles.listCard}>
                    {recentMatches.map((food, i) => (
                      <FoodRow
                        key={`rm-${food.name}`}
                        food={food}
                        icon="time-outline"
                        isLast={i === recentMatches.length - 1}
                      />
                    ))}
                  </GlassPanel>
                </>
              ) : null}
              {exactResults.length === 0 &&
              similarResults.length === 0 &&
              recentMatches.length === 0 &&
              !searchPending ? (
                <>
                  <SectionLabel label="RESULTS" />
                  <GlassPanel style={styles.listCard}>
                    <Text style={styles.empty}>No matches. Try another name.</Text>
                  </GlassPanel>
                </>
              ) : (
                <>
                  {exactResults.length > 0 ? (
                    <>
                      <SectionLabel label="RESULTS" />
                      <GlassPanel style={styles.listCard}>
                        {exactResults.map((food, i) => (
                          <FoodRow
                            key={`e-${food.name}`}
                            food={food}
                            icon="nutrition-outline"
                            isLast={i === exactResults.length - 1}
                          />
                        ))}
                      </GlassPanel>
                    </>
                  ) : null}
                  {similarResults.length > 0 ? (
                    <>
                      <SectionLabel label="SIMILAR" />
                      <GlassPanel style={styles.listCard}>
                        {similarResults.map((food, i) => (
                          <FoodRow
                            key={`s-${food.name}`}
                            food={food}
                            icon="sparkles-outline"
                            isLast={i === similarResults.length - 1}
                          />
                        ))}
                      </GlassPanel>
                    </>
                  ) : null}
                </>
              )}
            </Animated.View>
          ) : (
            <>
              {recent.length > 0 ? (
                <Animated.View entering={FadeInDown.delay(40).duration(280)}>
                  <SectionLabel label="RECENT" />
                  <GlassPanel style={styles.listCard}>
                    {recent.map((food, i) => (
                      <FoodRow
                        key={`r-${food.name}`}
                        food={food}
                        icon="time-outline"
                        isLast={i === recent.length - 1}
                      />
                    ))}
                  </GlassPanel>
                </Animated.View>
              ) : null}

              <Animated.View entering={FadeInDown.delay(80).duration(280)}>
                <SectionLabel label="COMMON" />
                <GlassPanel style={styles.listCard}>
                  {common.map((food, i) => (
                    <FoodRow
                      key={`c-${food.name}`}
                      food={food}
                      icon="sparkles"
                      isLast={i === common.length - 1 && browseVisible.length === 0}
                    />
                  ))}
                  {browseVisible.map((food, i) => (
                    <FoodRow
                      key={`b-${food.name}`}
                      food={food}
                      icon="nutrition-outline"
                      isLast={i === browseVisible.length - 1 && browseRemaining === 0}
                    />
                  ))}
                  {browseRemaining > 0 ? (
                    <Pressable
                      onPress={loadMoreBrowse}
                      style={({ pressed }) => [styles.loadMore, pressableWeb, pressed && { opacity: 0.8 }]}
                      accessibilityRole="button"
                      accessibilityLabel="Load more foods">
                      <Text style={styles.loadMoreText}>
                        Scroll for more · {browseRemaining.toLocaleString()} left
                      </Text>
                    </Pressable>
                  ) : null}
                </GlassPanel>
              </Animated.View>
            </>
          )}
          </ScrollView>
        </View>
      </SafeAreaView>
    </PageCanvas>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  page: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
  },
  scrollView: {
    flex: 1,
    width: '100%',
  },
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
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  iconBtnSpacer: { width: layout.iconBtn, height: layout.iconBtn },
  topTitle: {
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 2,
    color: colors.text,
  },
  scroll: {
    paddingBottom: layout.scrollBottomPad,
    gap: spacing.md,
    flexGrow: 1,
  },
  searchResults: {
    gap: spacing.md,
    width: '100%',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: '100%',
    height: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,138,61,0.35)',
    overflow: 'hidden',
  },
  searchIcon: {
    marginRight: 10,
    width: 20,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.text,
    paddingHorizontal: 0,
    margin: 0,
    // Match row height so placeholder/caret stay vertically centered (esp. web).
    ...(Platform.OS === 'web'
      ? ({
          height: '100%',
          lineHeight: 52,
          paddingTop: 0,
          paddingBottom: 0,
          display: 'flex',
          alignItems: 'center',
        } as object)
      : {
          height: 52,
          lineHeight: 52,
          paddingVertical: 0,
          textAlignVertical: 'center' as const,
          ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
        }),
  },
  searchPending: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingVertical: 4,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    marginTop: 4,
  },
  sectionRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,138,61,0.45)',
  },
  sectionLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.textSecondary,
  },
  listCard: {
    width: '100%',
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    overflow: 'hidden',
  },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: spacing.sm,
  },
  foodRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  foodIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,138,61,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,138,61,0.35)',
  },
  foodName: {
    flex: 1,
    fontFamily: fonts.displayMedium,
    fontSize: 16,
    color: colors.text,
  },
  empty: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textTertiary,
    padding: spacing.lg,
    textAlign: 'center',
  },
  loadMore: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  loadMoreText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.textTertiary,
  },
});
