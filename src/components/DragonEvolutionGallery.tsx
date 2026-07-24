import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  DRAGONS,
  effectiveLevel,
  getDragonProgress,
  stageForXpLevel,
  type DragonType,
} from '@/lib/character';
import type { DragonId, Profile } from '@/lib/types';
import { colors, fonts, radius, spacing } from '@/theme';

const CARD_W = 148;
const CARD_GAP = 12;
const SNAP = CARD_W + CARD_GAP;

const SECTION_LABEL: Record<DragonId, string> = {
  fire: 'EMBER',
  ice: 'ICE',
  forest: 'FOREST',
};

const SECTION_ICON: Record<DragonId, keyof typeof Ionicons.glyphMap> = {
  fire: 'flame',
  ice: 'snow',
  forest: 'leaf',
};

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function DragonStageRow({
  dragon,
  currentStageIndex,
}: {
  dragon: DragonType;
  currentStageIndex: number;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(currentStageIndex);
  const [viewportW, setViewportW] = useState(0);
  const accent = dragon.accent;
  const lastIndex = dragon.stages.length - 1;
  const centerCurrent = currentStageIndex > 0;
  const sidePad = viewportW > 0 ? Math.max(0, (viewportW - CARD_W) / 2) : 0;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const next = Math.round(x / SNAP);
    setPage(Math.max(0, Math.min(lastIndex, next)));
  };

  const scrollTo = (index: number, animated = true) => {
    const clamped = Math.max(0, Math.min(lastIndex, index));
    scrollRef.current?.scrollTo({ x: clamped * SNAP, animated });
    setPage(clamped);
  };

  // Stage 1 stays left-aligned; later stages open with the current card centered.
  useEffect(() => {
    if (viewportW <= 0) return;
    if (!centerCurrent) {
      scrollTo(0, false);
      return;
    }
    const id = requestAnimationFrame(() => scrollTo(currentStageIndex, false));
    return () => cancelAnimationFrame(id);
  }, [currentStageIndex, centerCurrent, viewportW]);

  return (
    <View style={styles.rowBlock}>
      <View style={styles.rowHeader}>
        <View style={styles.rowTitleWrap}>
          <Ionicons name={SECTION_ICON[dragon.id]} size={16} color={accent} />
          <Text style={[styles.rowTitle, { color: accent }]}>
            {SECTION_LABEL[dragon.id]} DRAGONS
          </Text>
        </View>
        <Text style={styles.stageCount}>{dragon.stages.length} STAGES</Text>
      </View>

      <View
        style={styles.carouselWrap}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (w > 0 && Math.abs(w - viewportW) > 1) setViewportW(w);
        }}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={SNAP}
          snapToAlignment="start"
          disableIntervalMomentum
          nestedScrollEnabled
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={[
            styles.carouselContent,
            {
              paddingLeft: centerCurrent ? sidePad : 0,
              paddingRight: Math.max(sidePad, 44),
            },
          ]}>
          {dragon.stages.map((stage) => {
            const active = stage.index === currentStageIndex;
            return (
              <View
                key={stage.index}
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.bg,
                    borderColor: hexToRgba(accent, active ? 0.72 : 0.28),
                    borderWidth: active ? 2 : 1,
                    boxShadow: active
                      ? `0 0 22px ${hexToRgba(accent, 0.48)}, 0 0 8px ${hexToRgba(accent, 0.35)}`
                      : `0 0 14px ${hexToRgba(accent, 0.16)}`,
                  },
                ]}>
                <View
                  pointerEvents="none"
                  style={[
                    styles.cardTint,
                    {
                      backgroundColor: hexToRgba(accent, active ? 0.14 : 0.05),
                      borderTopColor: hexToRgba(accent, active ? 0.4 : 0.16),
                    },
                  ]}
                />
                <Text style={styles.stageNum}>STAGE {stage.index + 1}</Text>
                <Text style={[styles.stageName, { color: accent }]}>{stage.name}</Text>
                <Text style={[styles.levelUnlock, { color: accent }]}>LV {stage.levelRequired}</Text>
                <Image source={stage.art} style={styles.art} resizeMode="contain" />
                <Text style={styles.perk} numberOfLines={2}>
                  {stage.perk}
                </Text>
                <View
                  style={[
                    styles.dash,
                    {
                      backgroundColor: accent,
                      opacity: active ? 1 : 0.55,
                    },
                  ]}
                />
              </View>
            );
          })}
        </ScrollView>

        {page < lastIndex ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Next ${SECTION_LABEL[dragon.id]} stage`}
            onPress={() => scrollTo(page + 1)}
            style={({ pressed }) => [
              styles.chevronBtn,
              { borderColor: accent, opacity: pressed ? 0.75 : 1 },
            ]}>
            <Ionicons name="chevron-forward" size={18} color={accent} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.dots}>
        {dragon.stages.map((stage) => (
          <Pressable
            key={stage.index}
            onPress={() => scrollTo(stage.index)}
            hitSlop={8}
            style={[
              styles.dot,
              {
                backgroundColor: page === stage.index ? accent : colors.hairlineBright,
                width: page === stage.index ? 14 : 6,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

export function DragonEvolutionGallery({ profile }: { profile?: Profile | null }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.progressPill} accessibilityRole="header">
        <View style={styles.progressIcon}>
          <MaterialCommunityIcons name="fire" size={16} color={colors.accentSecondary} />
        </View>
        <Text style={styles.progressLabel}>DRAGON PROGRESSIONS</Text>
      </View>

      {DRAGONS.map((dragon) => {
        const progress = profile ? getDragonProgress(profile, dragon.id) : null;
        const level = progress ? effectiveLevel(progress) : 1;
        const current = stageForXpLevel(level, dragon.id);
        return (
          <DragonStageRow
            key={dragon.id}
            dragon={dragon}
            currentStageIndex={current.index}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  progressPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bgRaised,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.button,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    minHeight: 52,
  },
  progressIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(155, 140, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressLabel: {
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.8,
    color: colors.accentSecondary,
  },
  rowBlock: {
    gap: spacing.sm,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: spacing.xs,
  },
  rowTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowTitle: {
    fontFamily: fonts.monoBold,
    fontSize: 12,
    letterSpacing: 1.4,
  },
  stageCount: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.textTertiary,
  },
  carouselWrap: {
    position: 'relative',
  },
  carouselContent: {
    gap: CARD_GAP,
    paddingVertical: 6,
  },
  card: {
    width: CARD_W,
    alignItems: 'center',
    borderRadius: radius.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    gap: 6,
    overflow: 'hidden',
  },
  cardTint: {
    ...StyleSheet.absoluteFill,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  stageNum: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1.6,
    color: colors.textTertiary,
  },
  stageName: {
    fontFamily: fonts.displayHeavy,
    fontSize: 18,
    letterSpacing: -0.2,
  },
  levelUnlock: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1.4,
    opacity: 0.85,
  },
  art: {
    width: 128,
    height: 128,
    marginVertical: 2,
  },
  perk: {
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    minHeight: 30,
    paddingHorizontal: 4,
  },
  dash: {
    width: 28,
    height: 3,
    borderRadius: 2,
    marginTop: 4,
    opacity: 0.9,
  },
  chevronBtn: {
    position: 'absolute',
    right: 4,
    top: '42%',
    marginTop: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    backgroundColor: colors.bgRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 2,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
});
