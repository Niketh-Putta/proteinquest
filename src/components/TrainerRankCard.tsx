import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatXp } from '@/lib/leaderboard';
import type { Profile } from '@/lib/types';
import { xpSnapshot } from '@/lib/xp';
import { colors, displayLH, fonts, noTextCaret, pressableWeb, shadowCard, spacing } from '@/theme';

export type TrainerRankVariant = 'rich' | 'compact';
const AVATAR_RED = '#E23B2F';

interface Props {
  profile: Profile;
  onPress?: () => void;
  variant?: TrainerRankVariant;
}

function trainerInitials(profile: Profile): string {
  const name = profile.display_name?.trim();
  if (!name) return 'PQ';
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function TrainerAvatar({ profile, compact }: { profile: Profile; compact?: boolean }) {
  const uri = profile.avatar_url?.trim() || null;
  const ringStyle = compact ? styles.avatarRingCompact : styles.avatarRing;
  const wellStyle = compact ? styles.avatarWellCompact : styles.avatarWell;

  return (
    <View style={ringStyle}>
      <View style={wellStyle}>
        {uri ? (
          <Image
            source={{ uri }}
            style={styles.avatarArt}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={0}
          />
        ) : (
          <View style={styles.avatarFallback}>
            <Text selectable={false} style={styles.avatarInitials}>
              {trainerInitials(profile)}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function RankEyebrow({ compact }: { compact?: boolean }) {
  if (compact) {
    return (
      <Text selectable={false} style={styles.eyebrowCompact}>
        TRAINER • ALL DRAGONS
      </Text>
    );
  }
  return (
    <View style={styles.eyebrowRow}>
      <Text selectable={false} style={[styles.eyebrowPart, styles.eyebrowTrainer]}>
        TRAINER
      </Text>
      <View style={styles.eyebrowDivider} />
      <Text selectable={false} style={[styles.eyebrowPart, styles.eyebrowAll]}>
        ALL DRAGONS
      </Text>
    </View>
  );
}

function XpHexBadge({ size = 26 }: { size?: number }) {
  return (
    <View style={[styles.hexWrap, { width: size, height: size }]}>
      <MaterialCommunityIcons name="hexagon" size={size} color={colors.accent} />
      <Text selectable={false} style={[styles.hexLabel, { fontSize: size * 0.28 }]}>
        XP
      </Text>
    </View>
  );
}

export function TrainerRankCard({ profile, onPress, variant = 'rich' }: Props) {
  const snapshot = xpSnapshot(profile);

  const accessibilityLabel = `Trainer rank ${snapshot.rank.label}, ${formatXp(snapshot.xp)} total XP across all dragons`;

  const content =
    variant === 'compact' ? (
      <LinearGradient
        colors={['#181416', '#100E10']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.compactInner}>
        <TrainerAvatar profile={profile} compact />
        <View style={styles.compactBody}>
          <RankEyebrow compact />
          <Text selectable={false} style={styles.rankTitleCompact}>
            {snapshot.rank.label}
          </Text>
          <Text selectable={false} style={styles.xpLineCompact}>
            <Text style={styles.xpNumber}>{formatXp(snapshot.xp)}</Text>
            <Text style={styles.xpUnit}> XP total</Text>
          </Text>
        </View>
      </LinearGradient>
    ) : (
      <LinearGradient
        colors={['#1A1518', '#141214', '#0E0C0E']}
        locations={[0, 0.52, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.richInner}>
        <TrainerAvatar profile={profile} />
        <View style={styles.richBody}>
          <RankEyebrow />
          <Text selectable={false} style={styles.rankTitle}>
            {snapshot.rank.label}
          </Text>
          <View style={styles.rankRule} />
          <View style={styles.xpRow}>
            <XpHexBadge size={23} />
            <Text selectable={false} style={styles.xpLine}>
              <Text style={styles.xpNumber}>{formatXp(snapshot.xp)}</Text>
              <Text style={styles.xpUnit}> XP total</Text>
            </Text>
          </View>
        </View>
      </LinearGradient>
    );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`${accessibilityLabel}. Open leaderboard`}
        style={({ pressed }) => [
          variant === 'compact' ? styles.compactCard : styles.richCard,
          pressed && { opacity: 0.88 },
          pressableWeb,
        ]}>
        {content}
      </Pressable>
    );
  }

  return (
    <View
      style={variant === 'compact' ? styles.compactCard : styles.richCard}
      accessibilityLabel={accessibilityLabel}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  richCard: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'flex-start',
    marginBottom: spacing.lg,
    borderRadius: 20,
    backgroundColor: '#121012',
    borderWidth: 1.5,
    borderColor: '#4A383C',
    overflow: 'hidden',
    ...shadowCard,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 16px 40px rgba(0,0,0,0.34), 0 0 24px rgba(226,59,47,0.07)' }
      : {
          shadowColor: AVATAR_RED,
          shadowOpacity: 0.08,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
        }),
  },
  richInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 88,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  avatarRing: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 2,
    borderColor: AVATAR_RED,
    padding: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#141214',
  },
  avatarWell: {
    width: '100%',
    height: '100%',
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#0C0A0B',
  },
  avatarArt: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1214',
  },
  avatarInitials: {
    ...noTextCaret,
    fontFamily: fonts.displayHeavy,
    fontSize: 18,
    color: '#FF8B73',
    letterSpacing: 0.5,
  },
  richBody: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eyebrowPart: {
    ...noTextCaret,
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 1.3,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    lineHeight: 10,
  },
  eyebrowTrainer: {
    color: '#FF8B73',
  },
  eyebrowAll: {
    color: '#A89894',
  },
  eyebrowDivider: {
    width: 1,
    height: 11,
    backgroundColor: colors.accent,
    opacity: 0.85,
  },
  rankTitle: {
    ...noTextCaret,
    fontFamily: fonts.displayMedium,
    fontSize: 21,
    lineHeight: displayLH(21),
    color: colors.text,
    letterSpacing: -0.2,
  },
  xpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  rankRule: {
    width: '100%',
    height: StyleSheet.hairlineWidth,
    marginTop: 4,
    backgroundColor: '#3A3234',
  },
  hexWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  hexLabel: {
    ...noTextCaret,
    position: 'absolute',
    fontFamily: fonts.monoBold,
    color: colors.onAccent,
    letterSpacing: 0.2,
    ...(Platform.OS === 'web' ? { textShadow: '0 1px 2px rgba(0,0,0,0.45)' } : null),
  },
  xpLine: {
    ...noTextCaret,
    fontFamily: fonts.mono,
    fontSize: 12,
    lineHeight: 15,
    flexShrink: 1,
  },
  xpNumber: {
    fontFamily: fonts.monoBold,
    color: colors.accent,
    fontVariant: ['tabular-nums'],
  },
  xpUnit: {
    fontFamily: fonts.mono,
    color: colors.textSecondary,
    fontSize: 11,
  },
  compactCard: {
    flexShrink: 1,
    width: 188,
    maxWidth: '52%',
    marginRight: spacing.md,
    marginTop: 2,
    borderRadius: 18,
    borderWidth: 1.25,
    borderColor: '#4A383C',
    backgroundColor: '#121012',
    overflow: 'hidden',
  },
  compactInner: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  compactBody: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  avatarRingCompact: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1.75,
    borderColor: AVATAR_RED,
    padding: 1.5,
    backgroundColor: '#141214',
  },
  avatarWellCompact: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#0C0A0B',
  },
  eyebrowCompact: {
    ...noTextCaret,
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 1.2,
    color: colors.textTertiary,
    lineHeight: 10,
  },
  rankTitleCompact: {
    ...noTextCaret,
    fontFamily: fonts.monoBold,
    fontSize: 13,
    letterSpacing: 0.3,
    color: colors.text,
    lineHeight: 16,
  },
  xpLineCompact: {
    ...noTextCaret,
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 14,
    fontVariant: ['tabular-nums'],
  },
});
