import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
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
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Polygon,
  Stop,
} from 'react-native-svg';
import { PageCanvas } from '@/components/PageCanvas';
import { trackEvent } from '@/lib/analytics';
import { confirmDestructive } from '@/lib/confirm';
import {
  displayDragonId,
  displayDragonName,
  displayProgress,
  effectiveLevel,
  stageForXpLevel,
} from '@/lib/character';
import {
  createDuel,
  dragonShareCardMessage,
  duelDaysLeft,
  duelShareMessage,
  fetchActiveDuels,
  refreshDuelTotals,
} from '@/lib/duels';
import { flexFill, flexScroll, useLayout, useTabBarScrollInset } from '@/lib/layout';
import { fetchLogsForDate } from '@/lib/api';
import {
  buildLeaderboard,
  fetchLeaderboard,
  formatXp,
  inviteUrl,
  removeFriend,
  type LeaderboardEntry,
  type LeaderboardRow,
} from '@/lib/leaderboard';
import { todayISODate } from '@/lib/protein';
import { useSession } from '@/lib/session';
import { publicSiteOrigin } from '@/lib/site';
import type { ProteinDuel } from '@/lib/types';
import { colors, displayLH, fonts, noTextCaret, pressableWeb, radius, spacing } from '@/theme';

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

const CHAMPION_WINGS = require('@/assets/champion-wings-red.png');
/** Asset is 435×201 — keep container on that ratio so tips are not stretched/cropped. */
const WINGS_WIDTH = 164;
const WINGS_HEIGHT = Math.round(WINGS_WIDTH * (201 / 435));
const CHAMPION_AVATAR_SIZE = 68;

/** Layered metallic treatment gives the champion wings depth without a neon-flat tint. */
function ChampionWings() {
  return (
    <View style={styles.wings} pointerEvents="none">
      <View style={styles.wingsAura} />
      <Image
        source={CHAMPION_WINGS}
        style={styles.wingsImg}
        contentFit="contain"
        recyclingKey="champion-wings"
      />
    </View>
  );
}

function PodiumTop({ place }: { place: 1 | 2 | 3 }) {
  const champion = place === 1;
  const gradientId = `podium-top-${place}`;
  const points =
    place === 2
      ? '0,24 100,24 100,1 12,1'
      : place === 3
        ? '0,24 100,24 88,1 0,1'
        : '0,24 100,24 90,1 10,1';
  return (
    <View style={styles.pedestalTop} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 100 24" preserveAspectRatio="none">
        <Defs>
          <SvgLinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={champion ? '#7E292E' : '#48191D'} />
            <Stop offset="0.5" stopColor={champion ? '#3D1217' : '#241014'} />
            <Stop offset="1" stopColor="#10090B" />
          </SvgLinearGradient>
        </Defs>
        <Polygon
          points={points}
          fill={`url(#${gradientId})`}
          stroke={champion ? '#FF5C55' : '#8E2B2C'}
          strokeWidth={champion ? 1.15 : 0.75}
          vectorEffect="non-scaling-stroke"
        />
        <Polygon
          points="1,23 99,23 97,20 3,20"
          fill={champion ? 'rgba(255,69,60,0.20)' : 'rgba(255,69,60,0.09)'}
        />
      </Svg>
    </View>
  );
}

function PodiumBlock({
  height,
  place,
  children,
}: {
  height: number;
  place: 1 | 2 | 3;
  children: React.ReactNode;
}) {
  const champion = place === 1;
  return (
    <View style={styles.pedestalWrap}>
      <PodiumTop place={place} />
      <LinearGradient
        colors={
          champion
            ? (['#351217', '#190C0F', '#090708'] as const)
            : (['#241014', '#110B0D', '#080708'] as const)
        }
        locations={[0, 0.58, 1]}
        style={[styles.pedestalFace, { height }, champion && styles.pedestalFaceChamp]}>
        <View style={[styles.pedestalShine, champion && styles.pedestalShineChamp]} />
        <View style={styles.pedestalLeftFacet} />
        <View style={styles.pedestalRightFacet} />
        {children}
      </LinearGradient>
    </View>
  );
}

function canRemove(entry: LeaderboardEntry | undefined): entry is LeaderboardEntry {
  return !!entry && !entry.isYou && !entry.isBot && !!entry.isFriend;
}

/** One stepped pedestal column. Champion (place 1) is tallest, crowned and glowing. */
function PodiumColumn({
  entry,
  place,
  youArt,
  onRemove,
}: {
  entry?: LeaderboardEntry;
  place: 1 | 2 | 3;
  youArt?: ImageSourcePropType;
  onRemove?: (entry: LeaderboardEntry) => void;
}) {
  if (!entry) return <View style={styles.podCol} />;

  const isChamp = place === 1;
  const pedestalHeight = place === 1 ? 118 : place === 2 ? 86 : 64;
  const avatarSize = isChamp ? CHAMPION_AVATAR_SIZE : 50;
  const removable = canRemove(entry);

  return (
    <Animated.View
      entering={FadeInDown.delay(place === 1 ? 0 : place === 2 ? 90 : 150).duration(360)}
      style={[styles.podCol, isChamp && styles.podColChamp]}>
      <View style={styles.podTop}>
        {removable && onRemove ? (
          <Pressable
            onPress={() => onRemove(entry)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${entry.displayName}`}
            style={[styles.podRemove, pressableWeb]}>
            <Ionicons name="close" size={14} color={colors.textTertiary} />
          </Pressable>
        ) : null}
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
          <View style={isChamp ? styles.champAvatarFront : undefined}>
            <Avatar
              entry={entry}
              size={avatarSize}
              dragonArt={entry.isYou ? youArt : undefined}
              ring={isChamp}
            />
          </View>
        </View>
        <Text style={[styles.podHandle, entry.isYou && { color: RED.bright }]} numberOfLines={1}>
          {handleLabel(entry)}
        </Text>
      </View>

      <PodiumBlock height={pedestalHeight} place={place}>
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
  const { horizontalPad, contentMaxWidth, isNarrow } = useLayout();
  const titleSize = isNarrow ? 26 : 30;
  const bottomInset = useTabBarScrollInset();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [duels, setDuels] = useState<ProteinDuel[]>([]);
  const [duelBusy, setDuelBusy] = useState(false);

  const reloadLeaderboard = useCallback(() => {
    setLoading(true);
    return Promise.all([
      fetchLeaderboard().then(setRows),
      fetchActiveDuels()
        .then(async (list) => {
          const refreshed = await Promise.all(
            list.map((d) => refreshDuelTotals(d.id).catch(() => d)),
          );
          setDuels(refreshed);
        })
        .catch(() => setDuels([])),
    ])
      .catch((e) => {
        if (__DEV__) console.warn('[friends] leaderboard failed:', e);
        setRows([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      reloadLeaderboard();
    }, [reloadLeaderboard]),
  );

  async function challengeFriend(friendId: string) {
    if (duelBusy) return;
    setDuelBusy(true);
    try {
      const duel = await createDuel(friendId);
      trackEvent('duel_created', { duel_id: duel.id });
      await reloadLeaderboard();
      setInviteStatus('7-day protein duel started. Scan to climb.');
      setTimeout(() => setInviteStatus(null), 2800);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not start duel';
      setInviteStatus(msg);
      setTimeout(() => setInviteStatus(null), 2800);
    } finally {
      setDuelBusy(false);
    }
  }

  async function shareDragonCard() {
    if (!profile) return;
    const origin = publicSiteOrigin();
    const url = inviteUrl(profile, origin);
    const todayISO = todayISODate();
    const dragonName = displayDragonName(profile, displayDragonId(profile, todayISO));
    let proteinToday = 0;
    try {
      const dayLogs = await fetchLogsForDate(todayISO);
      proteinToday = dayLogs.reduce((sum, log) => sum + Number(log.protein_g), 0);
    } catch {
      /* fall back to 0 if today's logs fail to load */
    }
    const message = dragonShareCardMessage({
      dragonName,
      proteinToday,
      goal: profile.protein_goal_g ?? 0,
      inviteUrl: url,
    });
    trackEvent('duel_share', { kind: 'dragon_card' });
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
        const nav = navigator as unknown as {
          share?: (d: { title: string; text: string }) => Promise<void>;
          clipboard?: { writeText?: (t: string) => Promise<void> };
        };
        setInviteLink(message);
        if (nav.clipboard?.writeText) await nav.clipboard.writeText(message);
        if (nav.share) await nav.share({ title: 'ProteinQuest', text: message }).catch(() => {});
        setInviteStatus('Share card copied.');
      } else {
        await Share.share({ message });
      }
    } catch {
      /* cancelled */
    }
  }

  async function shareDuel(duel: ProteinDuel) {
    const uid = session?.user.id;
    if (!uid || !profile) return;
    const mine =
      uid === duel.challenger_id ? Number(duel.challenger_protein) : Number(duel.opponent_protein);
    const theirs =
      uid === duel.challenger_id ? Number(duel.opponent_protein) : Number(duel.challenger_protein);
    const origin = publicSiteOrigin();
    const message = duelShareMessage({
      myName: profile.display_name?.trim() || 'I',
      myProtein: mine,
      theirProtein: theirs,
      daysLeft: duelDaysLeft(duel.end_date),
      inviteUrl: inviteUrl(profile, origin),
    });
    trackEvent('duel_share', { kind: 'duel', duel_id: duel.id });
    try {
      if (Platform.OS === 'web') {
        setInviteLink(message);
        setInviteStatus('Duel status ready to share.');
      } else {
        await Share.share({ message });
      }
    } catch {
      /* cancelled */
    }
  }

  function confirmRemove(entry: LeaderboardEntry) {
    if (!canRemove(entry)) return;
    confirmDestructive(
      'Remove friend?',
      `${entry.displayName} will be removed from your friends list.`,
      'Remove',
    ).then((ok) => {
      if (!ok) return;
      setRemovingId(entry.id);
      removeFriend(entry.id)
        .then(() => reloadLeaderboard())
        .catch((e) => {
          if (__DEV__) console.warn('[friends] remove failed:', e);
          if (Platform.OS === 'web') window.alert('Could not remove. Please try again in a moment.');
        })
        .finally(() => setRemovingId(null));
    });
  }

  const entries = buildLeaderboard(rows, session?.user.id, profile);
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);
  const playerCount = entries.length;
  const todayISO = todayISODate();
  const youDragonArt: ImageSourcePropType | undefined = profile
    ? stageForXpLevel(effectiveLevel(displayProgress(profile, todayISO)), displayDragonId(profile, todayISO)).art
    : undefined;

  async function invite() {
    const origin = publicSiteOrigin();
    const url = inviteUrl(profile, origin);
    if (!url) {
      setInviteStatus('Preparing your invite link. Try again in a moment.');
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
          setInviteStatus('Link copied. Send it to a friend. They auto-join when they open it.');
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
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>PROTEINQUEST</Text>
              <Text
                style={[styles.title, { fontSize: titleSize, lineHeight: displayLH(titleSize) }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.82}>
                Leaderboard
              </Text>
              <Text style={styles.subtitle}>
                {loading
                  ? 'Loading your league…'
                  : `${playerCount} player${playerCount === 1 ? '' : 's'} ranked`}
              </Text>
            </View>
            <Pressable
              onPress={shareDragonCard}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Share dragon card"
              style={({ pressed }) => [
                styles.invite,
                pressableWeb,
                { marginRight: 8 },
                pressed && { opacity: 0.7 },
              ]}>
              <Ionicons name="share-outline" size={18} color={colors.text} />
            </Pressable>
            <Pressable
              onPress={invite}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Invite friends"
              android_ripple={{ color: 'rgba(246, 244, 248, 0.08)' }}
              style={({ pressed }) => [
                styles.invite,
                styles.inviteShrink,
                pressableWeb,
                // Opacity-only feedback — never swap fill/border to accent or system active colors.
                pressed && styles.invitePressed,
              ]}>
              <Ionicons name="person-add" size={14} color={colors.text} />
              <Text style={[styles.inviteText, noTextCaret]} selectable={false}>
                Invite Friends
              </Text>
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
                  setInviteStatus('Link copied. Send it to a friend. They auto-join when they open it.');
                }
              }}
              style={[styles.inviteLinkRow, pressableWeb]}>
              <Text style={styles.inviteLinkText} numberOfLines={1} selectable>
                {inviteLink}
              </Text>
              <Ionicons name="copy-outline" size={15} color={colors.accent} />
            </Pressable>
          ) : null}

          {duels.length > 0 ? (
            <View style={styles.duelBox}>
              <Text style={styles.duelTitle}>ACTIVE DUELS</Text>
              {duels.map((d) => {
                const uid = session?.user.id;
                const mine =
                  uid === d.challenger_id
                    ? Number(d.challenger_protein)
                    : Number(d.opponent_protein);
                const theirs =
                  uid === d.challenger_id
                    ? Number(d.opponent_protein)
                    : Number(d.challenger_protein);
                return (
                  <Pressable
                    key={d.id}
                    onPress={() => shareDuel(d)}
                    style={({ pressed }) => [styles.duelRow, pressableWeb, pressed && { opacity: 0.8 }]}>
                    <Text style={styles.duelScore}>
                      {Math.round(mine)}g vs {Math.round(theirs)}g
                    </Text>
                    <Text style={styles.duelMeta}>{duelDaysLeft(d.end_date)}d left · tap to share</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <View style={styles.podium}>
            <PodiumColumn entry={podium[1]} place={2} youArt={youDragonArt} onRemove={confirmRemove} />
            <PodiumColumn entry={podium[0]} place={1} youArt={youDragonArt} onRemove={confirmRemove} />
            <PodiumColumn entry={podium[2]} place={3} youArt={youDragonArt} onRemove={confirmRemove} />
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
                {canRemove(entry) ? (
                  <Pressable
                    onPress={() => challengeFriend(entry.id)}
                    disabled={duelBusy}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Duel ${entry.displayName}`}
                    style={({ pressed }) => [styles.rowDuel, pressableWeb, pressed && { opacity: 0.7 }]}>
                    <Ionicons name="flash" size={14} color={colors.accent} />
                  </Pressable>
                ) : null}
                {canRemove(entry) ? (
                  <Pressable
                    onPress={() => confirmRemove(entry)}
                    disabled={removingId === entry.id}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${entry.displayName}`}
                    style={({ pressed }) => [styles.rowRemove, pressableWeb, pressed && { opacity: 0.7 }]}>
                    <Ionicons name="close" size={16} color={colors.textTertiary} />
                  </Pressable>
                ) : null}
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
    gap: spacing.sm,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
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
    color: colors.text,
    letterSpacing: -0.8,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  inviteShrink: {
    flexShrink: 0,
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
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({
          WebkitTapHighlightColor: 'transparent',
          userSelect: 'none',
          outlineStyle: 'none',
          // Avoid browser :active paint that flashes a different fill.
          transitionProperty: 'opacity',
          transitionDuration: '80ms',
        } as object)
      : null),
  },
  invitePressed: {
    opacity: 0.82,
    backgroundColor: colors.surface,
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
    overflow: 'visible',
  },
  podCol: {
    flex: 1,
    alignItems: 'center',
    overflow: 'visible',
  },
  podColChamp: {
    zIndex: 3,
  },
  podTop: {
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    width: '100%',
    overflow: 'visible',
  },
  podRemove: {
    position: 'absolute',
    top: -4,
    right: 4,
    zIndex: 2,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crown: {
    marginBottom: -2,
    textShadowColor: 'rgba(255,180,84,0.5)',
    textShadowRadius: 12,
  },
  champAvatarWrap: {
    width: CHAMPION_AVATAR_SIZE,
    height: CHAMPION_AVATAR_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    overflow: 'visible',
  },
  champAvatarFront: {
    zIndex: 2,
  },
  wings: {
    position: 'absolute',
    width: WINGS_WIDTH,
    height: WINGS_HEIGHT,
    left: (CHAMPION_AVATAR_SIZE - WINGS_WIDTH) / 2,
    top: (CHAMPION_AVATAR_SIZE - WINGS_HEIGHT) / 2,
    zIndex: 0,
    overflow: 'visible',
  },
  wingsAura: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: 12,
    bottom: 2,
    borderRadius: 48,
    backgroundColor: Platform.OS === 'web' ? 'rgba(255,28,28,0.18)' : 'transparent',
    ...(Platform.OS === 'web' ? { filter: 'blur(18px)' } : {}),
  } as unknown as object,
  wingsImg: {
    width: '100%',
    height: '100%',
    tintColor: '#C52A31',
    opacity: 0.9,
  },
  champGlow: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    left: (CHAMPION_AVATAR_SIZE - 96) / 2,
    top: (CHAMPION_AVATAR_SIZE - 96) / 2,
    backgroundColor: Platform.OS === 'web' ? RED.glow : 'transparent',
    opacity: Platform.OS === 'web' ? 1 : 0,
    zIndex: 0,
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
    width: '100%',
    height: 24,
  },
  pedestalFace: {
    marginTop: -2,
    borderTopWidth: 1,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderTopColor: RED.edge,
    borderLeftColor: 'rgba(255,59,48,0.22)',
    borderRightColor: 'rgba(255,59,48,0.14)',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: spacing.lg,
    gap: 3,
    overflow: 'hidden',
  },
  pedestalFaceChamp: {
    borderTopColor: RED.bright,
    borderLeftColor: 'rgba(255,59,48,0.22)',
  },
  pedestalShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,144,136,0.18)',
  },
  pedestalShineChamp: {
    height: 2,
    backgroundColor: 'rgba(255,122,112,0.48)',
  },
  pedestalLeftFacet: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 8,
    backgroundColor: 'rgba(255,72,65,0.045)',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(255,92,84,0.08)',
  },
  pedestalRightFacet: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 10,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: 'rgba(255,255,255,0.025)',
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
  duelBox: {
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,122,89,0.35)',
    gap: 8,
  },
  duelTitle: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.4,
    color: colors.textTertiary,
  },
  duelRow: { gap: 2, paddingVertical: 4 },
  duelScore: {
    fontFamily: fonts.displayMedium,
    fontSize: 15,
    color: colors.text,
  },
  duelMeta: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textTertiary,
  },
  rowDuel: {
    padding: 6,
    marginRight: 2,
  },
  rowRemove: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -4,
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
