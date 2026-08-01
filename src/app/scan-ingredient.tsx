import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  startTransition,
} from 'react';
import {
  InteractionManager,
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
import { SkeletonList } from '@/components/LoadingSkeleton';
import { PageCanvas } from '@/components/PageCanvas';
import type { CatalogFood } from '@/lib/food-catalog';
import { useContentColumn } from '@/lib/layout';
import { colors, fonts, layout, pressableWeb, radius, spacing, textInputWeb } from '@/theme';

type FoodCatalogApi = typeof import('@/lib/food-catalog');

function openAdjust(api: FoodCatalogApi, food: CatalogFood) {
  void api.pushRecentFood(food);
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
  onPress,
}: {
  food: CatalogFood;
  icon: keyof typeof Ionicons.glyphMap;
  isLast: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
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

function CatalogSkeleton() {
  return (
    <View>
      <SectionLabel label="COMMON" />
      <SkeletonList rows={8} />
    </View>
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
  const [api, setApi] = useState<FoodCatalogApi | null>(null);
  const [screenFocused, setScreenFocused] = useState(false);
  const catalogReady = api != null;

  // Paint header + skeleton first (critical on iOS push). Load catalog after the transition.
  useEffect(() => {
    let alive = true;
    const task = InteractionManager.runAfterInteractions(() => {
      if (!alive) return;
      void import('@/lib/food-catalog').then((mod) => {
        if (!alive) return;
        setApi(mod);
        void mod.loadRecentFoods().then((list) => {
          if (alive) setRecent(list);
        });
        void mod.refreshRemoteFoodCatalog().then(() => {
          if (alive) setCatalogTick((n) => n + 1);
        });
      });
    });
    return () => {
      alive = false;
      task.cancel?.();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      if (!api) {
        return () => setScreenFocused(false);
      }
      let alive = true;
      void api.loadRecentFoods().then((list) => {
        if (alive) setRecent(list);
      });
      void api.refreshRemoteFoodCatalog().then(() => {
        if (alive) setCatalogTick((n) => n + 1);
      });
      return () => {
        alive = false;
        setScreenFocused(false);
      };
    }, [api]),
  );

  const trimmedQuery = query.trim();
  const deferredTrimmed = deferredQuery.trim();
  const searching = trimmedQuery.length > 0;
  const searchPending = searching && deferredTrimmed !== trimmedQuery;

  const recentMatches = useMemo(
    () => (api && searching ? api.filterRecentCatalogFoods(recent, trimmedQuery) : []),
    [api, searching, recent, trimmedQuery],
  );

  const exactResults = useMemo(() => {
    if (!api || !deferredTrimmed) return [];
    return api.searchCatalogExact(deferredTrimmed);
  }, [api, deferredTrimmed, catalogTick]);

  const [similarResults, setSimilarResults] = useState<CatalogFood[]>([]);

  useEffect(() => {
    if (!api || !deferredTrimmed) {
      setSimilarResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      startTransition(() => {
        if (cancelled) return;
        setSimilarResults(api.searchCatalogSimilar(deferredTrimmed, exactResults));
      });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [api, deferredTrimmed, exactResults, catalogTick]);

  const commonBase = useMemo(
    () => (api ? api.commonCatalogFoods() : []),
    [api, catalogTick],
  );

  const common = useMemo(() => {
    const recentNames = new Set(recent.map((r) => r.name.toLowerCase()));
    return commonBase.filter((f) => !recentNames.has(f.name.toLowerCase()));
  }, [recent, commonBase]);

  const browseMore = useMemo(() => {
    if (!api || searching) return [] as CatalogFood[];
    const skip = new Set([
      ...recent.map((r) => r.name.toLowerCase()),
      ...commonBase.map((f) => f.name.toLowerCase()),
    ]);
    return api
      .allCatalogFoods()
      .filter((f) => !skip.has(f.name.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [api, searching, recent, commonBase, catalogTick]);

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
              if (!catalogReady || searching || browseRemaining <= 0) return;
              const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
              if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 480) {
                loadMoreBrowse();
              }
            }}>
            <Animated.View entering={FadeIn.duration(180)} style={styles.searchWrap}>
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
                // Avoid stealing focus while the route is only prefetched on iOS.
                autoFocus={screenFocused && catalogReady}
                editable={catalogReady}
                returnKeyType="search"
                clearButtonMode="while-editing"
                accessibilityLabel="Search food"
              />
            </Animated.View>

            {!catalogReady ? (
              <CatalogSkeleton />
            ) : searching ? (
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
                          onPress={() => api && openAdjust(api, food)}
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
                              onPress={() => api && openAdjust(api, food)}
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
                              onPress={() => api && openAdjust(api, food)}
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
                          onPress={() => api && openAdjust(api, food)}
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
                        onPress={() => api && openAdjust(api, food)}
                      />
                    ))}
                    {browseVisible.map((food, i) => (
                      <FoodRow
                        key={`b-${food.name}`}
                        food={food}
                        icon="nutrition-outline"
                        isLast={i === browseVisible.length - 1 && browseRemaining === 0}
                        onPress={() => api && openAdjust(api, food)}
                      />
                    ))}
                    {browseRemaining > 0 ? (
                      <Pressable
                        onPress={loadMoreBrowse}
                        style={({ pressed }) => [
                          styles.loadMore,
                          pressableWeb,
                          pressed && { opacity: 0.8 },
                        ]}
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
  },
  searchPending: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textTertiary,
    paddingHorizontal: spacing.xs,
  },
  searchWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: spacing.md,
    zIndex: 1,
  },
  searchInput: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.text,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.md,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    paddingLeft: 44,
    paddingRight: spacing.md,
    // Match row height so placeholder/caret stay vertically centered (esp. web).
    minHeight: 48,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  sectionLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.6,
    color: colors.textTertiary,
  },
  listCard: {
    overflow: 'hidden',
    paddingVertical: 2,
  },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  foodRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  foodIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  foodName: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.text,
  },
  empty: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textTertiary,
    padding: spacing.md,
  },
  loadMore: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  loadMoreText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 0.6,
    color: colors.textTertiary,
  },
});
