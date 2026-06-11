import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  type ImageSourcePropType,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PageCanvas } from '@/components/PageCanvas';
import {
  displayDragonId,
  displayProgress,
  effectiveLevel,
  stageForXpLevel,
} from '@/lib/character';
import { flexFill, flexScroll, useLayout, useTabBarScrollInset } from '@/lib/layout';
import {
  buildLeaderboard,
  fetchFriendLeaderboard,
  formatXp,
  inviteUrl,
  type FriendLeaderboardRow,
  type LeaderboardEntry,
} from '@/lib/leaderboard';
import { todayISODate } from '@/lib/protein';
import { useSession } from '@/lib/session';
import { colors, fonts, pressableWeb, radius, spacing } from '@/theme';

const AVATAR_HUES = ['#FF7A59', '#9B8CFF', '#5BC8F5', '#5AD67A', '#FFB454', '#FF6B7A'];

function avatarColor(handle: string): string {
  let h = 0;
  for (let i = 0; i < handle.length; i++) h = (h * 31 + handle.charCodeAt(i)) % 9973;
  return AVATAR_HUES[h % AVATAR_HUES.length];
}

function handleLabel(entry: LeaderboardEntry): string {
  return entry.isYou ? 'you' : `@${entry.handle}`;
}

function Avatar({
  entry,
  size,
  dragonArt,
  ring,
}: {
  entry: LeaderboardEntry;
  size: number;
  dragonArt?: ImageSourcePropType;
  ring?: boolean;
}) {
  const tint = entry.isYou ? colors.accent : avatarColor(entry.handle);
  const ringStyle = ring
    ? { borderWidth: 2, borderColor: entry.isYou ? colors.accent : colors.accentLight }
    : { borderWidth: StyleSheet.hairlineWidth, borderColor: `${tint}55` };

  if (dragonArt) {
    return (
      <View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.accentSurface,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
          },
          ring ? { borderWidth: 2, borderColor: colors.accent } : { borderWidth: 1.5, borderColor: colors.accent },
        ]}>
        <Image source={dragonArt} style={{ width: size * 1.1, height: size * 1.1 }} contentFit="contain" />
      </View>
    );
  }

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: `${tint}1F`,
          alignItems: 'center',
          justifyContent: 'center',
        },
        ringStyle,
      ]}>
      <Text style={{ fontFamily: fonts.displayMedium, fontSize: size * 0.36, color: tint }}>
        {entry.displayName.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

function ChampionWings() {
  return (
    <View style={styles.wings}>
      <View style={[styles.wing, styles.wingLeft]}>
        <View style={[styles.feather, styles.featherOne]} />
        <View style={[styles.feather, styles.featherTwo]} />
        <View style={[styles.feather, styles.featherThree]} />
      </View>
      <View style={[styles.wing, styles.wingRight]}>
        <View style={[styles.feather, styles.featherOne]} />
        <View style={[styles.feather, styles.featherTwo]} />
        <View style={[styles.feather, styles.featherThree]} />
      </View>
    </View>
  );
}

/** One stepped pedestal column. Champion (place 1) is tallest, crowned and glowing. */
function PodiumColumn({
  entry,
  place,
  youArt,
}: {
  entry?: LeaderboardEntry;
  place: 1 | 2 | 3;
  youArt?: ImageSourcePropType;
}) {
  if (!entry) return <View style={styles.podCol} />;

  const isChamp = place === 1;
  const pedestalHeight = place === 1 ? 104 : place === 2 ? 78 : 60;
  const avatarSize = isChamp ? 68 : 50;

  return (
    <Animated.View
      entering={FadeInDown.delay(place === 1 ? 0 : place === 2 ? 90 : 150).duration(360)}
      style={styles.podCol}>
      <View style={styles.podTop}>
        {isChamp ? (
          <MaterialCommunityIcons
            name="crown"
            size={22}
            color={colors.warning}
            style={styles.crown}
          />
        ) : null}
        <View style={isChamp ? styles.champAvatarWrap : undefined}>
          {isChamp ? <View style={styles.champGlow} /> : null}
          {isChamp ? <ChampionWings /> : null}
          <Avatar
            entry={entry}
            size={avatarSize}
            dragonArt={entry.isYou ? youArt : undefined}
            ring={isChamp}
          />
        </View>
        <Text style={[styles.podHandle, entry.isYou && { color: colors.accent }]} numberOfLines={1}>
          {handleLabel(entry)}
        </Text>
      </View>

      <View
        style={[
          styles.pedestal,
          { height: pedestalHeight },
          isChamp && styles.pedestalChamp,
        ]}>
        <Text style={styles.pedXp}>
          {formatXp(entry.xp)} <Text style={styles.pedXpUnit}>XP</Text>
        </Text>
        <Text style={styles.pedLevel}>lvl {entry.level}</Text>
      </View>
    </Animated.View>
  );
}

export default function LeagueTab() {
  const { profile, session } = useSession();
  const { horizontalPad, contentMaxWidth } = useLayout();
  const bottomInset = useTabBarScrollInset();
  const [rows, setRows] = useState<FriendLeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      fetchFriendLeaderboard()
        .then((next) => {
          if (!cancelled) setRows(next);
        })
        .catch((e) => {
          if (__DEV__) console.warn('[friends] leaderboard failed:', e);
          if (!cancelled) setRows([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, []),
  );

  const entries = buildLeaderboard(rows, session?.user.id);
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);
  const friendCount = Math.max(entries.length - 1, 0);
  const todayISO = todayISODate();
  const youDragonArt: ImageSourcePropType | undefined = profile
    ? stageForXpLevel(effectiveLevel(displayProgress(profile, todayISO)), displayDragonId(profile, todayISO)).art
    : undefined;

  async function invite() {
    const origin =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.origin
        : 'https://proteinquest.vercel.app';
    const url = inviteUrl(profile, origin);
    const message = url
      ? `Join my ProteinQuest league and try to out-log me: ${url}`
      : 'Join me on ProteinQuest and climb the protein league.';
    try {
      if (Platform.OS === 'web') {
        const nav =
          typeof navigator !== 'undefined'
            ? (navigator as unknown as {
                share?: (data: { title: string; text: string }) => Promise<void>;
                clipboard?: { writeText?: (text: string) => Promise<void> };
              })
            : undefined;
        if (nav?.share) await nav.share({ title: 'ProteinQuest', text: message });
        else if (nav?.clipboard?.writeText && url) {
          await nav.clipboard.writeText(url);
          setInviteStatus('Invite link copied.');
          setTimeout(() => setInviteStatus(null), 1800);
        }
      } else {
        await Share.share({ message });
      }
    } catch {
      /* user cancelled or share unavailable */
    }
  }

  return (
    <PageCanvas>
      <SafeAreaView style={flexFill} edges={['top']}>
        <ScrollView
          style={flexScroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scroll,
            {
              paddingHorizontal: horizontalPad,
              maxWidth: contentMaxWidth,
              width: '100%',
              alignSelf: 'center',
              paddingBottom: bottomInset,
            },
          ]}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>PROTEINQUEST</Text>
              <Text style={styles.title}>Leaderboard</Text>
              <Text style={styles.subtitle}>
                {loading ? 'Loading your league…' : `${friendCount} friends added`}
              </Text>
            </View>
            <Pressable
              onPress={invite}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Invite friends"
              style={({ pressed }) => [
                styles.invite,
                pressableWeb,
                pressed && { opacity: 0.85 },
              ]}>
              <Ionicons name="person-add" size={14} color={colors.text} />
              <Text style={styles.inviteText}>Invite Friends</Text>
            </Pressable>
          </View>
          {inviteStatus ? <Text style={styles.inviteStatus}>{inviteStatus}</Text> : null}

          <View style={styles.podium}>
            <PodiumColumn entry={podium[1]} place={2} youArt={youDragonArt} />
            <PodiumColumn entry={podium[0]} place={1} youArt={youDragonArt} />
            <PodiumColumn entry={podium[2]} place={3} youArt={youDragonArt} />
          </View>

          {!loading && friendCount === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Invite friends to unlock the league.</Text>
              <Text style={styles.emptyText}>
                Your board is real now — only accepted friends appear here.
              </Text>
            </View>
          ) : null}

          <View style={styles.list}>
            {rest.map((entry, i) => (
              <Animated.View
                key={entry.id}
                entering={FadeInDown.delay(40 * Math.min(i, 8)).duration(260)}
                style={[styles.row, entry.isYou && styles.rowYou]}>
                <Text style={[styles.rowRank, entry.isYou && { color: colors.accent }]}>
                  {entry.position}
                </Text>
                <Avatar entry={entry} size={36} dragonArt={entry.isYou ? youDragonArt : undefined} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={[styles.rowName, entry.isYou && { color: colors.accent }]}
                    numberOfLines={1}>
                    {handleLabel(entry)}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {entry.rank.label}
                  </Text>
                </View>
                <Text style={styles.rowLevel}>lvl {entry.level}</Text>
                <Text style={styles.rowXp}>
                  {formatXp(entry.xp)} <Text style={styles.rowXpUnit}>XP</Text>
                </Text>
              </Animated.View>
            ))}
          </View>

          <Text style={styles.footnote}>
            1 XP per gram logged · hit your daily goal for +100 bonus XP
          </Text>
        </ScrollView>
      </SafeAreaView>
    </PageCanvas>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  eyebrow: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 3,
    color: colors.accent,
    marginBottom: 5,
  },
  title: {
    fontFamily: fonts.displayHeavy,
    fontSize: 34,
    color: colors.text,
    letterSpacing: -1,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  invite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineBright,
  },
  inviteText: {
    fontFamily: fonts.displayMedium,
    fontSize: 12,
    color: colors.text,
  },
  inviteStatus: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.6,
    color: colors.accent,
    textAlign: 'right',
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },

  // Podium
  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  podCol: {
    flex: 1,
    alignItems: 'center',
  },
  podTop: {
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  crown: {
    marginBottom: -2,
    textShadowColor: 'rgba(255,180,84,0.5)',
    textShadowRadius: 12,
  },
  champAvatarWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  wings: {
    position: 'absolute',
    width: 178,
    height: 74,
    top: -5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wing: {
    position: 'absolute',
    width: 70,
    height: 58,
    opacity: 0.48,
  },
  wingLeft: {
    left: 0,
    transform: [{ rotate: '-9deg' }],
  },
  wingRight: {
    right: 0,
    transform: [{ rotate: '9deg' }, { scaleX: -1 }],
  },
  feather: {
    position: 'absolute',
    right: 0,
    borderTopWidth: 2,
    borderTopColor: 'rgba(255, 122, 89, 0.55)',
    borderTopLeftRadius: 40,
    width: 66,
  },
  featherOne: {
    top: 8,
    height: 36,
    transform: [{ rotate: '-32deg' }],
  },
  featherTwo: {
    top: 19,
    height: 30,
    width: 58,
    transform: [{ rotate: '-18deg' }],
  },
  featherThree: {
    top: 31,
    height: 22,
    width: 48,
    transform: [{ rotate: '-6deg' }],
  },
  champGlow: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.accent,
    opacity: 0.22,
    ...(Platform.OS === 'web' ? { filter: 'blur(26px)' } : {}),
  } as unknown as object,
  podHandle: {
    fontFamily: fonts.displayMedium,
    fontSize: 12,
    color: colors.textSecondary,
    maxWidth: '96%',
  },
  pedestal: {
    width: '100%',
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
    backgroundColor: '#18171E',
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: spacing.md,
    gap: 3,
  },
  pedestalChamp: {
    backgroundColor: '#241611',
    borderColor: colors.accent,
    borderTopWidth: 2,
  },
  pedXp: {
    fontFamily: fonts.display,
    fontSize: 15,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  pedXpUnit: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 0.5,
    color: colors.accent,
  },
  pedLevel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.textSecondary,
  },

  // Ranked list
  emptyCard: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineBright,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontFamily: fonts.displayMedium,
    fontSize: 15,
    color: colors.text,
  },
  emptyText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  list: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 11,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  rowYou: {
    backgroundColor: colors.accentSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accent,
    borderRadius: radius.sm,
    marginVertical: 3,
  },
  rowRank: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.textTertiary,
    width: 24,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  rowName: {
    fontFamily: fonts.displayMedium,
    fontSize: 14,
    color: colors.text,
  },
  rowSub: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1,
    color: colors.textTertiary,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  rowLevel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 0.5,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  rowXp: {
    fontFamily: fonts.display,
    fontSize: 14,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    minWidth: 64,
    textAlign: 'right',
  },
  rowXpUnit: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 0.5,
    color: colors.accent,
  },
  footnote: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.5,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
