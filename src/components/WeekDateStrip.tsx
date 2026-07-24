import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { todayISODate } from '@/lib/protein';
import { colors, fonts, pressableWeb, radius, spacing } from '@/theme';

/** 5 chips: 2 past + today + 2 future (future shown dimmed, not selectable). */
export const DATE_STRIP_PAST = 2;
export const DATE_STRIP_FUTURE = 2;
export const DATE_STRIP_TOTAL = DATE_STRIP_PAST + 1 + DATE_STRIP_FUTURE;

export type DateStripDay = {
  iso: string;
  dayLetter: string;
  monthDay: string;
  proteinG: number;
  isToday: boolean;
  isFuture: boolean;
  isPast: boolean;
  hitGoal: boolean;
  progress: number;
};

type Props = {
  selectedISO: string;
  goalG: number;
  totals: Record<string, number>;
  /** Live total for the day currently loaded (keeps today in sync after a scan). */
  liveISO?: string;
  liveProteinG?: number;
  onSelect: (iso: string) => void;
  style?: ViewStyle;
  compact?: boolean;
};

function buildDays(
  goalG: number,
  totals: Record<string, number>,
  liveISO?: string,
  liveProteinG?: number,
): DateStripDay[] {
  const today = todayISODate();
  return Array.from({ length: DATE_STRIP_TOTAL }, (_, i) => {
    const offset = i - DATE_STRIP_PAST;
    const iso = todayISODate(offset);
    const d = new Date(`${iso}T12:00:00`);
    const proteinG =
      liveISO === iso && liveProteinG != null ? liveProteinG : (totals[iso] ?? 0);
    const progress = goalG > 0 ? Math.min(proteinG / goalG, 1) : 0;
    const hitGoal = goalG > 0 && proteinG >= goalG;
    return {
      iso,
      dayLetter: d.toLocaleDateString(undefined, { weekday: 'narrow' }).toUpperCase(),
      monthDay: d
        .toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        .toUpperCase(),
      proteinG,
      isToday: iso === today,
      isFuture: offset > 0,
      isPast: offset < 0,
      hitGoal,
      progress,
    };
  });
}

function MiniRing({
  size,
  progress,
  hitGoal,
  isFuture,
}: {
  size: number;
  progress: number;
  hitGoal: boolean;
  isFuture: boolean;
}) {
  const strokeWidth = 3;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = isFuture ? 0 : Math.min(Math.max(progress, 0), 1);
  const showTick = hitGoal && !isFuture;
  const trackStroke = isFuture ? colors.hairline : colors.ringTrack;

  return (
    <View
      style={[
        styles.ringWrap,
        {
          width: size,
          height: size,
          shadowOpacity: pct > 0 ? 0.55 : 0,
        },
      ]}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={trackStroke}
          strokeWidth={strokeWidth}
          fill="none"
          opacity={0.85}
        />
        {pct > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={colors.accent}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${circumference * pct} ${circumference * (1 - pct)}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            opacity={0.95}
          />
        ) : null}
      </Svg>
      {showTick ? (
        <View style={styles.tickOverlay}>
          <Ionicons name="checkmark" size={Math.round(size * 0.42)} color="#FFFFFF" />
        </View>
      ) : null}
    </View>
  );
}

function DayChip({
  day,
  selected,
  goalG,
  onPress,
  compact,
}: {
  day: DateStripDay;
  selected: boolean;
  goalG: number;
  onPress: () => void;
  compact?: boolean;
}) {
  const ringSize = compact ? 28 : 32;
  const disabled = day.isFuture;
  const isSelected = selected && !disabled;

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected, disabled }}
      accessibilityLabel={`${day.monthDay}${day.isToday ? ', today' : ''}${
        day.isFuture ? ', future, unavailable' : ''
      }${day.hitGoal ? ', goal hit' : ''}`}
      style={({ pressed }) => [
        styles.chip,
        compact && styles.chipCompact,
        isSelected && styles.chipSelected,
        disabled && styles.chipFuture,
        !disabled && pressableWeb,
        !disabled && pressed && { opacity: 0.85 },
      ]}>
      <Text
        style={[
          styles.dayLetter,
          isSelected && styles.dayLetterSelected,
          disabled && styles.muted,
        ]}>
        {day.dayLetter}
      </Text>
      <Text
        style={[
          styles.monthDay,
          isSelected && styles.monthDaySelected,
          disabled && styles.muted,
        ]}>
        {day.monthDay}
      </Text>
      <MiniRing
        size={ringSize}
        progress={goalG > 0 ? day.progress : 0}
        hitGoal={day.hitGoal}
        isFuture={day.isFuture}
      />
      {isSelected ? <View style={styles.selectedDot} /> : <View style={styles.selectedDotSpacer} />}
    </Pressable>
  );
}

export function WeekDateStrip({
  selectedISO,
  goalG,
  totals,
  liveISO,
  liveProteinG,
  onSelect,
  style,
  compact,
}: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const days = useMemo(
    () => buildDays(goalG, totals, liveISO, liveProteinG),
    [goalG, totals, liveISO, liveProteinG],
  );
  const gap = compact ? 6 : 8;
  const chipW = compact ? 52 : 58;

  useEffect(() => {
    const idx = days.findIndex((d) => d.iso === selectedISO);
    if (idx < 0) return;
    const id = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        x: Math.max(0, (chipW + gap) * idx - chipW),
        animated: true,
      });
    });
    return () => cancelAnimationFrame(id);
  }, [selectedISO, days, chipW, gap]);

  return (
    <View style={[styles.wrap, style]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}>
        {days.map((item, i) => (
          <View key={item.iso} style={i > 0 ? { marginLeft: gap } : undefined}>
            <DayChip
              day={item}
              selected={item.iso === selectedISO}
              goalG={goalG}
              compact={compact}
              onPress={() => {
                if (item.isFuture) return;
                onSelect(item.iso);
              }}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minWidth: 0,
    maxHeight: 112,
  },
  listContent: {
    alignItems: 'center',
    paddingLeft: spacing.sm,
    paddingVertical: 2,
  },
  chip: {
    width: 58,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  chipCompact: {
    width: 52,
    paddingVertical: 6,
    gap: 3,
  },
  chipSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSurface,
  },
  chipFuture: {
    opacity: 0.45,
  },
  dayLetter: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: colors.textSecondary,
  },
  dayLetterSelected: {
    color: colors.accent,
  },
  monthDay: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 0.4,
    color: colors.textTertiary,
  },
  monthDaySelected: {
    color: colors.accentLight,
  },
  muted: {
    color: colors.textTertiary,
  },
  ringWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  tickOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginTop: 2,
  },
  selectedDotSpacer: {
    width: 5,
    height: 5,
    marginTop: 2,
  },
});
