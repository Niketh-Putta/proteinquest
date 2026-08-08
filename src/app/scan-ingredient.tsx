import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, startTransition } from 'react';
import {
  InteractionManager,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassPanel } from '@/components/GlassPanel';
import { PageCanvas } from '@/components/PageCanvas';
import {
  commonCatalogFoods,
  type CatalogFood,
  filterRecentCatalogFoods,
  getSortedBrowseCatalog,
  isHeavyFoodCatalogLoaded,
  loadRecentFoods,
  pushRecentFood,
  refreshRemoteFoodCatalog,
  searchCatalogExact,
  searchCatalogSimilar,
  loadHeavyFoodCatalog,
} from '@/lib/food-catalog';
import { useContentColumn } from '@/lib/layout';
import { pushThen } from '@/lib/navigate-responsive';
import { colors, fonts, layout, pressableWeb, radius, spacing, textInputWeb } from '@/theme';

const IS_ANDROID = Platform.OS === 'android';
const IS_NATIVE = Platform.OS !== 'web';
const IS_WEB = Platform.OS === 'web';
const SEARCH_ROW_H = 52;
/** Reanimated entering + heavy catalog under stacked screens jetsam-kills native. */
const Enter = IS_NATIVE ? View : Animated.View;
const enterProps = (delay = 0) =>
  IS_NATIVE ? {} : { entering: FadeInDown.delay(delay).duration(280) };

function safeReturnTo(raw: unknown): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const s = typeof value === 'string' ? value.trim() : '';
  if (s === '/scan' || s.startsWith('/meal/')) return s;
  return '/scan';
}

function openAdjust(food: CatalogFood, returnTo: string) {
  void pushRecentFood(food);
  const q = new URLSearchParams({
    index: '-1',
    name: food.name,
    portion: food.portion || '1 serving',
    protein: String(food.protein_g),
    calories: String(food.calories_g),
    mode: 'add',
    returnTo,
  });
  if (food.estimated_grams != null) q.set('grams', String(food.estimated_grams));
  const href = `/scan-adjust?${q.toString()}`;
  pushThen(href as never);
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
  returnTo,
}: {
  food: CatalogFood;
  icon: keyof typeof Ionicons.glyphMap;
  isLast: boolean;
  returnTo: string;
}) {
  return (
    <Pressable
      onPress={() => openAdjust(food, returnTo)}
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

const BROWSE_PAGE = IS_ANDROID ? 36 : 80;

export default function ScanIngredientScreen() {
  const column = useContentColumn('form');
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const returnTo = useMemo(() => safeReturnTo(params.returnTo), [params.returnTo]);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [recent, setRecent] = useState<CatalogFood[]>([]);
  const [browseLimit, setBrowseLimit] = useState(BROWSE_PAGE);
  const [catalogTick, setCatalogTick] = useState(0);
  // COMMON/base catalog is always available — never block first paint on heavy chunks.
  const [heavyReady, setHeavyReady] = useState(() => isHeavyFoodCatalogLoaded());
  const [browseReady, setBrowseReady] = useState(false);
  const searchRef = useRef<TextInput>(null);

  // Native: NEVER warm heavy catalog on mount — Hermes parse of ~600KB modules
  // OOMs / jetsam-kills when opened from meal edit (stacked with photo). Load on search.
  // Web: warm after paint so browse list fills in.
  useEffect(() => {
    if (IS_NATIVE) return;
    let alive = true;
    let delayTimer: ReturnType<typeof setTimeout> | undefined;
    const handle = InteractionManager.runAfterInteractions(() => {
      if (!alive) return;
      delayTimer = setTimeout(() => {
        if (!alive) return;
        void loadHeavyFoodCatalog()
          .then(() => {
            if (!alive) return;
            setHeavyReady(true);
            setCatalogTick((n) => n + 1);
          })
          .catch((e) => {
            console.warn('Heavy food catalog failed:', e);
          });
      }, 80);
    });
    return () => {
      alive = false;
      handle.cancel();
      if (delayTimer) clearTimeout(delayTimer);
    };
  }, []);

  // Autofocus skipped: Safari pans under status bar; native autofocus fights transition / OOM.

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void loadRecentFoods().then((list) => {
        if (alive) setRecent(list);
      });
      // Native: skip remote refresh on open (JSON parse crash risk); refresh on search instead.
      if (IS_NATIVE) {
        return () => {
          alive = false;
        };
      }
      let delayTimer: ReturnType<typeof setTimeout> | undefined;
      const handle = InteractionManager.runAfterInteractions(() => {
        if (!alive) return;
        delayTimer = setTimeout(() => {
          if (!alive) return;
          void refreshRemoteFoodCatalog().then(() => {
            if (alive) setCatalogTick((n) => n + 1);
          });
        }, 120);
      });
      return () => {
        alive = false;
        handle.cancel();
        if (delayTimer) clearTimeout(delayTimer);
      };
    }, []),
  );

  // Sort/filter full browse list after interactions so search + COMMON paint first.
  // Native: skip auto full-browse — COMMON + search only (full sort freezes taps / OOMs).
  useEffect(() => {
    if (!heavyReady) {
      setBrowseReady(false);
      return;
    }
    if (IS_NATIVE) {
      setBrowseReady(false);
      return;
    }
    let alive = true;
    const handle = InteractionManager.runAfterInteractions(() => {
      startTransition(() => {
        if (alive) setBrowseReady(true);
      });
    });
    return () => {
      alive = false;
      handle.cancel();
    };
  }, [heavyReady, catalogTick]);

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

  // Native: only pull heavy chunks after the user actually searches (2+ chars),
  // and only after interactions — open stays COMMON + base FOOD_CATALOG forever-safe.
  useEffect(() => {
    if (!IS_NATIVE) return;
    if (heavyReady) return;
    if (deferredTrimmed.length < 2) return;
    let alive = true;
    let delayTimer: ReturnType<typeof setTimeout> | undefined;
    const handle = InteractionManager.runAfterInteractions(() => {
      if (!alive) return;
      delayTimer = setTimeout(() => {
        if (!alive) return;
        void loadHeavyFoodCatalog()
          .then(() => {
            if (!alive) return;
            setHeavyReady(true);
            setCatalogTick((n) => n + 1);
          })
          .catch((e) => {
            console.warn('Heavy food catalog failed:', e);
          });
        void refreshRemoteFoodCatalog()
          .then(() => {
            if (alive) setCatalogTick((n) => n + 1);
          })
          .catch(() => {});
      }, 700);
    });
    return () => {
      alive = false;
      handle.cancel();
      if (delayTimer) clearTimeout(delayTimer);
    };
  }, [deferredTrimmed, heavyReady]);

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
    }, IS_NATIVE ? 180 : 60);
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

  /** Take first N browse rows without filtering the entire sorted catalog up front. */
  const browseVisible = useMemo(() => {
    if (searching || !browseReady) return [] as CatalogFood[];
    const skip = new Set([
      ...recent.map((r) => r.name.toLowerCase()),
      ...commonBase.map((f) => f.name.toLowerCase()),
    ]);
    const sorted = getSortedBrowseCatalog();
    const out: CatalogFood[] = [];
    for (const f of sorted) {
      if (skip.has(f.name.toLowerCase())) continue;
      out.push(f);
      if (out.length >= browseLimit) break;
    }
    return out;
  }, [searching, browseReady, recent, commonBase, catalogTick, browseLimit]);

  const browseHasMore = useMemo(() => {
    if (searching || !browseReady) return false;
    // Cheap probe: if we filled the page, assume more may exist.
    return browseVisible.length >= browseLimit;
  }, [searching, browseReady, browseVisible.length, browseLimit]);

  const showBrowseSkeleton = !searching && !IS_NATIVE && (!heavyReady || !browseReady);

  const loadMoreBrowse = useCallback(() => {
    setBrowseLimit((n) => n + BROWSE_PAGE);
  }, []);

  const topPad = Math.max(insets.top, 8);

  return (
    <PageCanvas>
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <KeyboardAvoidingView
          style={styles.safe}
          behavior={Platform.OS === 'ios' ? 'padding' : IS_WEB ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' || IS_WEB ? topPad : 0}>
          <View style={[styles.page, column, { paddingTop: topPad }]}>
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

            <View style={styles.searchWrap}>
              <View style={styles.searchIcon} pointerEvents="none">
                <Ionicons name="search" size={18} color={colors.textTertiary} />
              </View>
              <TextInput
                ref={searchRef}
                style={[styles.searchInput, textInputWeb]}
                value={query}
                onChangeText={setQuery}
                placeholder="Search food or ingredient..."
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="sentences"
                autoCorrect
                returnKeyType="search"
                clearButtonMode="while-editing"
                accessibilityLabel="Search food"
              />
            </View>

            <ScrollView
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              style={styles.scrollView}
              contentContainerStyle={styles.scroll}
              scrollEventThrottle={160}
              onScroll={(e) => {
                if (searching || !browseHasMore) return;
                const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
                if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 480) {
                  loadMoreBrowse();
                }
              }}>
              {searching ? (
                <Enter {...enterProps(0)} style={styles.searchResults}>
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
                            returnTo={returnTo}
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
                                returnTo={returnTo}
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
                                returnTo={returnTo}
                              />
                            ))}
                          </GlassPanel>
                        </>
                      ) : null}
                    </>
                  )}
                </Enter>
              ) : (
                <>
                  {recent.length > 0 ? (
                    <Enter {...enterProps(40)}>
                      <SectionLabel label="RECENT" />
                      <GlassPanel style={styles.listCard}>
                        {recent.map((food, i) => (
                          <FoodRow
                            key={`r-${food.name}`}
                            food={food}
                            icon="time-outline"
                            isLast={i === recent.length - 1}
                            returnTo={returnTo}
                          />
                        ))}
                      </GlassPanel>
                    </Enter>
                  ) : null}

                  <Enter {...enterProps(80)}>
                    <SectionLabel label="COMMON" />
                    <GlassPanel style={styles.listCard}>
                      {common.map((food, i) => (
                        <FoodRow
                          key={`c-${food.name}`}
                          food={food}
                          icon="sparkles"
                          isLast={i === common.length - 1 && browseVisible.length === 0}
                          returnTo={returnTo}
                        />
                      ))}
                      {browseVisible.map((food, i) => (
                        <FoodRow
                          key={`b-${food.name}`}
                          food={food}
                          icon="nutrition-outline"
                          isLast={i === browseVisible.length - 1 && !browseHasMore}
                          returnTo={returnTo}
                        />
                      ))}
                      {showBrowseSkeleton ? (
                        <View style={styles.loadMore}>
                          <Text style={styles.loadMoreText}>Loading more foods…</Text>
                        </View>
                      ) : null}
                      {browseHasMore ? (
                        <Pressable
                          onPress={loadMoreBrowse}
                          style={({ pressed }) => [styles.loadMore, pressableWeb, pressed && { opacity: 0.8 }]}
                          accessibilityRole="button"
                          accessibilityLabel="Load more foods">
                          <Text style={styles.loadMoreText}>Scroll for more</Text>
                        </Pressable>
                      ) : null}
                    </GlassPanel>
                  </Enter>
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
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
    height: SEARCH_ROW_H,
    marginBottom: spacing.md,
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
    height: SEARCH_ROW_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    height: SEARCH_ROW_H,
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 22,
    color: colors.text,
    paddingHorizontal: 0,
    paddingVertical: 0,
    margin: 0,
    ...(Platform.OS === 'android'
      ? { textAlignVertical: 'center' as const, includeFontPadding: false }
      : null),
    ...(IS_WEB
      ? ({
          // RN-web <input>: normal line-height + zero padding; row centers via alignItems.
          outlineStyle: 'none',
        } as object)
      : null),
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
