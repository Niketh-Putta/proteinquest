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

/** Red + black podium palette (per design reference). */
const RED = {
  bright: '#FF3B30',
  deep: '#C41E1E',
  glow: 'rgba(255, 59, 48, 0.30)',
  glowEdge: 'rgba(255, 59, 48, 0.45)',
  edge: 'rgba(255, 59, 48, 0.35)',
  blockTop: '#241013',
  blockTopChamp: '#3A1216',
  blockFace: '#120C0E',
  blockFaceChamp: '#1C0D10',
} as const;

function avatarColor(handle: string): string {
  let h = 0;
  for (let i = 0; i < handle.length; i++) h = (h * 31 + handle.charCodeAt(i)) % 9973;
  return AVATAR_HUES[h % AVATAR_HUES.length];
}

function handleLabel(entry: LeaderboardEntry): string {
  if (entry.isYou) return entry.displayName && entry.displayName !== 'You' ? entry.displayName : 'You';
  return entry.displayName;
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
  const tint = entry.isYou ? RED.bright : avatarColor(entry.handle);
  const ringStyle = ring
    ? { borderWidth: 2, borderColor: entry.isYou ? RED.bright : RED.glowEdge }
    : { borderWidth: StyleSheet.hairlineWidth, borderColor: `${tint}55` };

  if (entry.avatarUrl) {
    return (
      <View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.surface,
            overflow: 'hidden',
          },
          ring
            ? { borderWidth: 2, borderColor: RED.bright }
            : { borderWidth: 1.5, borderColor: RED.edge },
        ]}>
        <Image source={{ uri: entry.avatarUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
      </View>
    );
  }

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
          ring ? { borderWidth: 2, borderColor: RED.bright } : { borderWidth: 1.5, borderColor: RED.edge },
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

function PodiumBlock({
  height,
  champion,
  children,
}: {
  height: number;
  champion: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.pedestalWrap}>
      <View style={[styles.pedestalTop, champion && styles.pedestalTopChamp]} />
      <View style={[styles.pedestalFace, { height }, champion && styles.pedestalFaceChamp]}>
        {children}
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
  const pedestalHeight = place === 1 ? 108 : place === 2 ? 78 : 58;
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
        <Text style={[styles.podHandle, entry.isYou && { color: RED.bright }]} numberOfLines={1}>
          {handleLabel(entry)}
        </Text>
      </View>

      <PodiumBlock height={pedestalHeight} champion={isChamp}>
        <Text style={styles.pedXp}>
          {formatXp(entry.xp)} <Text style={styles.pedXpUnit}>XP</Text>
        </Text>
        <Text style={styles.pedLevel}>lvl {entry.level}</Text>
      </PodiumBlock>
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
  const [inviteLink, setInviteLink] = useState<string | null>(null);

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
  const friendCount = entries.filter((entry) => !entry.isYou && !entry.isBot).length;
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
    if (!url) {
      setInviteStatus('Preparing your invite link — try again in a moment.');
      setTimeout(() => setInviteStatus(null), 2400);
      return;
    }
    const message = `Join my ProteinQuest league and try to out-log me: ${url}`;
    try {
      if (Platform.OS === 'web') {
        const nav =
          typeof navigator !== 'undefined'
            ? (navigator as unknown as {
                share?: (data: { title: string; text: string }) => Promise<void>;
                clipboard?: { writeText?: (text: string) => Promise<void> };
              })
            : undefined;
        // Always reveal the link so the user can copy/send it manually too.
        setInviteLink(url);
        if (nav?.clipboard?.writeText) {
          await nav.clipboard.writeText(url);
          setInviteStatus('Link copied — send it to a friend. They auto-join when they open it.');
        } else {
          setInviteStatus('Copy this link and send it to a friend.');
        }
        if (nav?.share) {
          nav.share({ title: 'ProteinQuest', text: message }).catch(() => {});
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
                {loading
                  ? 'Loading your league…'
                  : friendCount > 0
                    ? `${friendCount} friends added`
                    : 'Invite friends to compete'}
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
          {inviteLink ? (
            <Pressable
              onPress={async () => {
                if (
                  Platform.OS === 'web' &&
                  typeof navigator !== 'undefined' &&
                  (navigator as unknown as { clipboard?: { writeText?: (t: string) => Promise<void> } })
                    .clipboard?.writeText
                ) {
                  await (
                    navigator as unknown as { clipboard: { writeText: (t: string) => Promise<void> } }
                  ).clipboard.writeText(inviteLink);
                  setInviteStatus('Link copied — send it to a friend. They auto-join when they open it.');
                }
              }}
              style={[styles.inviteLinkRow, pressableWeb]}>
              <Text style={styles.inviteLinkText} numberOfLines={1} selectable>
                {inviteLink}
              </Text>
              <Ionicons name="copy-outline" size={15} color={colors.accent} />
            </Pressable>
          ) : null}

          <View style={styles.podium}>
            <PodiumColumn entry={podium[1]} place={2} youArt={youDragonArt} />
            <PodiumColumn entry={podium[0]} place={1} youArt={youDragonArt} />
            <PodiumColumn entry={podium[2]} place={3} youArt={youDragonArt} />
          </View>

          <View style={styles.list}>
            {rest.map((entry, i) => (
              <Animated.View
                key={entry.id}
                entering={FadeInDown.delay(40 * Math.min(i, 8)).duration(260)}
                style={[styles.row, entry.isYou && styles.rowYou]}>
                <Text style={[styles.rowRank, entry.isYou && { color: RED.bright }]}>
                  {entry.position}
                </Text>
                <Avatar entry={entry} size={36} dragonArt={entry.isYou ? youDragonArt : undefined} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={[styles.rowName, entry.isYou && { color: RED.bright }]}
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
    marginBottom: spacing.xxl,
  },
  eyebrow: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 3,
    color: RED.bright,
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
    marginBottom: spacing.sm,
  },
  inviteLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RED.edge,
    marginBottom: spacing.md,
  },
  inviteLinkText: {
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textSecondary,
  },

  // Podium
  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 0,
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
    paddingHorizontal: 10,
  },
  podCol: {
    flex: 1,
    alignItems: 'center',
  },
  podTop: {
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
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
    borderTopColor: RED.glowEdge,
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
    backgroundColor: RED.bright,
    opacity: 0.26,
    ...(Platform.OS === 'web' ? { filter: 'blur(26px)' } : {}),
  } as unknown as object,
  podHandle: {
    fontFamily: fonts.displayMedium,
    fontSize: 12,
    color: colors.textSecondary,
    maxWidth: '96%',
  },
  pedestalWrap: {
    width: '100%',
    alignItems: 'stretch',
  },
  pedestalTop: {
    height: 18,
    marginHorizontal: 6,
    backgroundColor: RED.blockTop,
    borderTopWidth: 1,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: RED.edge,
    transform: [{ skewX: '-20deg' }],
  },
  pedestalTopChamp: {
    backgroundColor: RED.blockTopChamp,
    borderColor: RED.glowEdge,
  },
  pedestalFace: {
    marginTop: -1,
    backgroundColor: RED.blockFace,
    borderTopWidth: 1,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderTopColor: RED.edge,
    borderLeftColor: 'rgba(255,59,48,0.12)',
    borderRightColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: spacing.lg,
    gap: 3,
  },
  pedestalFaceChamp: {
    backgroundColor: RED.blockFaceChamp,
    borderTopColor: RED.bright,
    borderLeftColor: 'rgba(255,59,48,0.22)',
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
    color: RED.bright,
  },
  pedLevel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.textSecondary,
  },

  // Ranked list
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
    backgroundColor: 'rgba(255, 59, 48, 0.08)',
    borderLeftWidth: 2,
    borderLeftColor: RED.bright,
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
    color: RED.bright,
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
