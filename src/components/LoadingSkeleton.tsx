import React, { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { GlassPanel } from '@/components/GlassPanel';
import { colors, radius, spacing } from '@/theme';

/** Shared pulse opacity for skeleton placeholders (navigate-first loading style). */
export function useSkeletonPulse() {
  const opacity = useSharedValue(0.45);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
  }, [opacity]);
  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

export function SkeletonBlock({
  style,
  pulseStyle,
}: {
  style?: StyleProp<ViewStyle>;
  pulseStyle?: object;
}) {
  return <Animated.View style={[styles.block, pulseStyle, style]} />;
}

/** Generic list of skeleton rows inside a glass card. */
export function SkeletonList({
  rows = 6,
  rowHeight = 48,
}: {
  rows?: number;
  rowHeight?: number;
}) {
  const pulseStyle = useSkeletonPulse();
  return (
    <GlassPanel style={styles.listCard}>
      {Array.from({ length: rows }, (_, i) => (
        <View
          key={`sk-row-${i}`}
          style={[
            styles.row,
            { minHeight: rowHeight },
            i < rows - 1 && styles.rowBorder,
          ]}>
          <SkeletonBlock style={styles.icon} pulseStyle={pulseStyle} />
          <View style={styles.rowCopy}>
            <SkeletonBlock style={styles.linePrimary} pulseStyle={pulseStyle} />
            <SkeletonBlock style={styles.lineSecondary} pulseStyle={pulseStyle} />
          </View>
        </View>
      ))}
    </GlassPanel>
  );
}

/** Plan / card grid skeleton (paywall, league podium-ish). */
export function SkeletonCards({ count = 2 }: { count?: number }) {
  const pulseStyle = useSkeletonPulse();
  return (
    <View style={styles.cards}>
      {Array.from({ length: count }, (_, i) => (
        <View key={`sk-card-${i}`} style={styles.card}>
          <SkeletonBlock style={styles.cardTitle} pulseStyle={pulseStyle} />
          <SkeletonBlock style={styles.cardPrice} pulseStyle={pulseStyle} />
          <SkeletonBlock style={styles.cardCaption} pulseStyle={pulseStyle} />
        </View>
      ))}
    </View>
  );
}

/** Square media placeholder (meal photo / camera). */
export function SkeletonMedia({ style }: { style?: StyleProp<ViewStyle> }) {
  const pulseStyle = useSkeletonPulse();
  return <SkeletonBlock style={[styles.media, style]} pulseStyle={pulseStyle} />;
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.sm,
  },
  listCard: {
    overflow: 'hidden',
    paddingVertical: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 10,
  },
  rowCopy: {
    flex: 1,
    gap: 8,
  },
  linePrimary: {
    height: 14,
    width: '72%',
    borderRadius: 7,
  },
  lineSecondary: {
    height: 10,
    width: '44%',
    borderRadius: 5,
  },
  cards: {
    gap: spacing.sm,
  },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: {
    height: 12,
    width: '36%',
    borderRadius: 6,
  },
  cardPrice: {
    height: 28,
    width: '48%',
    borderRadius: 8,
  },
  cardCaption: {
    height: 10,
    width: '64%',
    borderRadius: 5,
  },
  media: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
});
