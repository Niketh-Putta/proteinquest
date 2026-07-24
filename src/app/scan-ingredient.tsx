import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
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
  COMMON_FOODS,
  type CatalogFood,
  loadRecentFoods,
  pushRecentFood,
  searchCatalog,
} from '@/lib/food-catalog';
import { useLayout } from '@/lib/layout';
import { colors, fonts, pressableWeb, radius, spacing, textInputWeb } from '@/theme';

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

export default function ScanIngredientScreen() {
  const { horizontalPad, formMaxWidth, formWidth } = useLayout();
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<CatalogFood[]>([]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void loadRecentFoods().then((list) => {
        if (alive) setRecent(list);
      });
      return () => {
        alive = false;
      };
    }, []),
  );

  const searching = query.trim().length > 0;
  const results = useMemo(() => searchCatalog(query), [query]);

  const common = useMemo(() => {
    const recentNames = new Set(recent.map((r) => r.name.toLowerCase()));
    return COMMON_FOODS.filter((f) => !recentNames.has(f.name.toLowerCase()));
  }, [recent]);

  return (
    <PageCanvas>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View
          style={[
            styles.topBar,
            {
              paddingHorizontal: horizontalPad,
              maxWidth: formMaxWidth,
              width: '100%',
              alignSelf: 'center',
            },
          ]}>
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
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.scroll,
            {
              paddingHorizontal: horizontalPad,
              maxWidth: formMaxWidth,
              width: formWidth,
              alignSelf: 'center',
            },
          ]}>
          <Animated.View entering={FadeIn.duration(240)} style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={colors.textTertiary} />
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
            <Animated.View entering={FadeInDown.duration(280)}>
              <SectionLabel label="RESULTS" />
              <GlassPanel style={styles.listCard}>
                {results.length === 0 ? (
                  <Text style={styles.empty}>No matches. Try another name.</Text>
                ) : (
                  results.map((food, i) => (
                    <FoodRow
                      key={food.name}
                      food={food}
                      icon="nutrition-outline"
                      isLast={i === results.length - 1}
                    />
                  ))
                )}
              </GlassPanel>
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
                      isLast={i === common.length - 1}
                    />
                  ))}
                </GlassPanel>
              </Animated.View>
            </>
          )}
        </ScrollView>
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
  iconBtnSpacer: { width: 44, height: 44 },
  topTitle: {
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 2,
    color: colors.text,
  },
  scroll: {
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.md,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,138,61,0.35)',
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 0,
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
});
