import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CharacterCard } from '@/components/CharacterCard';
import { DailyDragonPicker } from '@/components/DailyDragonPicker';
import { FeedQuest } from '@/components/FeedQuest';
import { FeedToast } from '@/components/FeedToast';
import { GlassPanel } from '@/components/GlassPanel';
import { ModalMotionLayer } from '@/components/ModalMotionLayer';
import { PageCanvas } from '@/components/PageCanvas';
import { ProgressRing } from '@/components/ProgressRing';
import { TrainerRankCard } from '@/components/TrainerRankCard';
import { WeekDateStrip } from '@/components/WeekDateStrip';
import { trackEvent } from '@/lib/analytics';
import {
  countLifetimeMeals,
  countTodayPhotoScans,
  deleteLog,
  fetchDailyTotals,
  fetchLatestMealAt,
  fetchLogsForDate,
  getFoodPhotoUrl,
  peekFoodPhotoUrl,
  prefetchFoodPhotoUrls,
} from '@/lib/api';
import { prefetchRoute } from '@/lib/navigate-responsive';
import { peekLocalMealPhoto } from '@/lib/local-meal-photo';
import {
  applyDeleteLogToCharacter,
  displayDragonId,
  displayDragonName,
  dragonById,
  isDailyDragonLockedForToday,
  warmAllDragonArt,
  warmDragonArt,
} from '@/lib/character';
import { hungerFromLastMealAt, hungerVoice } from '@/lib/dragon-hunger';
import { contentColumnStyle, flexFill, flexScroll, useLayout, useTabBarScrollInset } from '@/lib/layout';
import { needsFirstScan } from '@/lib/first-scan';
import { scheduleStreakAtRiskNudge } from '@/lib/meal-reminders';
import { hasUnlimitedScans, isPro, remainingFreeScans } from '@/lib/paywall-gate';
import { resolveCalorieAim, todayISODate } from '@/lib/protein';
import { getRetention } from '@/lib/retention';
import { useSession } from '@/lib/session';
import {
  invalidateTodayHomeCache,
  peekTodayHomeLogs,
  peekTodayHomeMeta,
  writeTodayHomeLogs,
  writeTodayHomeMeta,
} from '@/lib/today-home-cache';
import type { ProteinLog } from '@/lib/types';
import { colors, displayLH, fonts, layout, pressableWeb, radius, spacing, type } from '@/theme';

/** One range query covers date-strip chips + CharacterCard streak (up to 60 days). */
const HOME_TOTALS_DAYS = 60;

function LogMealThumb({
  logId,
  imagePath,
}: {
  logId: string;
  imagePath: string | null;
}) {
  const [uri, setUri] = useState<string | null>(
    () => peekLocalMealPhoto(logId) ?? peekFoodPhotoUrl(imagePath),
  );

  useEffect(() => {
    let cancelled = false;
    const local = peekLocalMealPhoto(logId);
    if (local) setUri(local);

    const cached = peekFoodPhotoUrl(imagePath);
    if (cached) {
      setUri(cached);
      return;
    }
    if (!imagePath) return;
    void getFoodPhotoUrl(imagePath).then((next) => {
      if (!cancelled && next) setUri(next);
    });
    return () => {
      cancelled = true;
    };
  }, [logId, imagePath]);

  return (
    <View style={thumbStyles.wrap}>
      {uri ? (
        <Image
          source={{ uri }}
          style={thumbStyles.img}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={imagePath ?? logId}
          transition={0}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Ionicons name="restaurant-outline" size={22} color={colors.textTertiary} />
      )}
    </View>
  );
}

const thumbStyles = StyleSheet.create({
  wrap: {
    width: 64,
    height: 64,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  img: {
    width: '100%',
    height: '100%',
  },
});

export default function TodayScreen() {
  const {
    ringSize,
    horizontalPad,
    contentMaxWidth,
    heroLayout,
    columnGap,
    asideWidth,
    titleSize,
    isNarrow,
  } = useLayout();
  const tabBarScrollInset = useTabBarScrollInset(isNarrow);
  const insets = useSafeAreaInsets();
  const { fed, protein, loot, freeze, food } = useLocalSearchParams<{
    fed?: string;
    protein?: string;
    loot?: string;
    freeze?: string;
    food?: string;
  }>();
  const { profile, saveProfile } = useSession();
  const [viewedISO, setViewedISO] = useState(() => todayISODate());
  const [dayTotals, setDayTotals] = useState<Record<string, number>>({});
  const [logs, setLogs] = useState<ProteinLog[]>([]);
  const [lastMealAt, setLastMealAt] = useState<string | null>(null);
  const [lifetimeMeals, setLifetimeMeals] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [fedPulse, setFedPulse] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const starveTrackedDay = useRef<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProteinLog | null>(null);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [scansLeft, setScansLeft] = useState<number | null>(null);
  /** Extra air below Dynamic Island so FREE / date never sit under the camera. */
  const headerTopPad = insets.top > 0 ? spacing.md : 0;
  const viewedISORef = useRef(viewedISO);
  viewedISORef.current = viewedISO;

  // Never stay on a future day (midnight rollover / stale selection).
  useEffect(() => {
    const today = todayISODate();
    if (viewedISO > today) setViewedISO(today);
  }, [viewedISO, nowMs]);

  const applyLogs = useCallback((logsData: ProteinLog[]) => {
    // Kick signing the same tick as paint; peekFoodPhotoUrl covers remounts.
    void prefetchFoodPhotoUrls(logsData.map((l) => l.image_path));
    setLogs(logsData);
    setNowMs(Date.now());
  }, []);

  /** Apply fetched meals only if the user is still viewing that calendar day. */
  const applyLogsIfViewing = useCallback(
    (date: string, logsData: ProteinLog[]) => {
      if (viewedISORef.current !== date) return;
      applyLogs(logsData);
    },
    [applyLogs],
  );

  const loadMeta = useCallback(async () => {
    if (isPro(profile)) {
      const [latest, life, totals] = await Promise.all([
        fetchLatestMealAt(),
        countLifetimeMeals(),
        fetchDailyTotals(HOME_TOTALS_DAYS),
      ]);
      setScansLeft(null);
      setLastMealAt(latest);
      setLifetimeMeals(life);
      setDayTotals(totals);
      if (profile?.id) {
        writeTodayHomeMeta(profile.id, {
          lastMealAt: latest,
          lifetimeMeals: life,
          dayTotals: totals,
          scansUsed: null,
        });
      }
      return;
    }
    const [used, latest, life, totals] = await Promise.all([
      countTodayPhotoScans(),
      fetchLatestMealAt(),
      countLifetimeMeals(),
      fetchDailyTotals(HOME_TOTALS_DAYS),
    ]);
    setScansLeft(remainingFreeScans(used, profile, life));
    setLastMealAt(latest);
    setLifetimeMeals(life);
    setDayTotals(totals);
    if (profile?.id) {
      writeTodayHomeMeta(profile.id, {
        lastMealAt: latest,
        lifetimeMeals: life,
        dayTotals: totals,
        scansUsed: used,
      });
    }
  }, [profile?.id, profile?.is_premium, profile?.created_at]);

  const loadDayLogs = useCallback(
    async (date: string) => {
      const logsData = await fetchLogsForDate(date);
      if (profile?.id) writeTodayHomeLogs(profile.id, date, logsData);
      applyLogsIfViewing(date, logsData);
      return logsData;
    },
    [applyLogsIfViewing, profile?.id],
  );

  /** Full home refresh (focus SWR + pull-to-refresh). */
  const load = useCallback(
    async (opts?: { force?: boolean }) => {
      const date = viewedISO;
      const userId = profile?.id;
      try {
        if (opts?.force && userId) invalidateTodayHomeCache(userId);

        const cachedMeta = !opts?.force ? peekTodayHomeMeta(userId) : null;
        const cachedLogs = !opts?.force ? peekTodayHomeLogs(userId, date) : null;

        if (cachedMeta) {
          setLastMealAt(cachedMeta.lastMealAt);
          setLifetimeMeals(cachedMeta.lifetimeMeals);
          setDayTotals(cachedMeta.dayTotals);
          if (isPro(profile)) setScansLeft(null);
          else {
            setScansLeft(
              remainingFreeScans(cachedMeta.scansUsed ?? 0, profile, cachedMeta.lifetimeMeals),
            );
          }
        }
        if (cachedLogs) applyLogsIfViewing(date, cachedLogs);

        // Fresh meta: paint cache now; soft-revalidate meals + meta in background.
        if (cachedMeta && !opts?.force) {
          void loadMeta().catch(() => {});
          if (!cachedLogs) return loadDayLogs(date);
          void fetchLogsForDate(date)
            .then((logsData) => {
              if (userId) writeTodayHomeLogs(userId, date, logsData);
              applyLogsIfViewing(date, logsData);
            })
            .catch(() => {});
          return cachedLogs;
        }

        const [logsData] = await Promise.all([loadDayLogs(date), loadMeta()]);
        return logsData;
      } catch (e) {
        console.error('Failed to load logs:', e);
        return [] as ProteinLog[];
      }
    },
    [applyLogsIfViewing, loadDayLogs, loadMeta, profile, viewedISO],
  );

  const loadRef = useRef(load);
  loadRef.current = load;
  const profileRef = useRef(profile);
  profileRef.current = profile;

  // Day strip: swap meals for the selected day (never keep the previous day's list).
  useEffect(() => {
    if (!profile?.id) return;
    const date = viewedISO;
    const userId = profile.id;
    const cached = peekTodayHomeLogs(userId, date);
    if (cached) {
      applyLogsIfViewing(date, cached);
      void fetchLogsForDate(date)
        .then((logsData) => {
          writeTodayHomeLogs(userId, date, logsData);
          applyLogsIfViewing(date, logsData);
        })
        .catch(() => {});
      return;
    }
    // Clear immediately so a slow fetch cannot leave yesterday's meals under today's label.
    applyLogsIfViewing(date, []);
    const meta = peekTodayHomeMeta(userId);
    if (!meta) return; // Focus bootstrap will full-load.
    void loadDayLogs(date).catch((e) => console.error('Failed to load day logs:', e));
  }, [viewedISO, profile?.id, applyLogsIfViewing, loadDayLogs]);
  useEffect(() => {
    if (!profile) return;
    warmDragonArt(displayDragonId(profile, todayISODate()));
    warmAllDragonArt();
  }, [profile?.id, profile?.daily_dragon_id]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void needsFirstScan().then((needs) => {
        if (active && needs) router.replace('/scan');
      });
      void loadRef.current().then((dayLogs) => {
        const p = profileRef.current;
        if (!active || !p) return;
        const name = displayDragonName(p, displayDragonId(p, todayISODate()));
        void scheduleStreakAtRiskNudge(name, dayLogs.length > 0).catch(() => {});
        if (dayLogs.length === 0) trackEvent('streak_at_risk_shown', { via: 'schedule' });
      });
      trackEvent('app_open', {});
      const tick = setInterval(() => setNowMs(Date.now()), 60_000);
      return () => {
        active = false;
        clearInterval(tick);
      };
    }, [profile?.id]),
  );

  useEffect(() => {
    if (fed !== '1') return;
    if (profile?.id) invalidateTodayHomeCache(profile.id);
    setViewedISO(todayISODate());
    setFedPulse(true);
    setLastMealAt(new Date().toISOString());
    const name = hungerDragonNameSafe();
    const g = protein ? Number(protein) : 0;
    const meal = typeof food === 'string' && food.trim() ? food.trim().slice(0, 36) : null;
    const loved = meal ? `${name} loved the ${meal}` : `${name} loved that`;
    const parts = [
      loved,
      g > 0 ? `+${Math.round(g)}g` : null,
      loot === '1' ? 'Egg shard!' : null,
      freeze === '1' ? 'Streak freeze' : null,
    ].filter(Boolean);
    setToastMsg(parts.join(' · '));
    trackEvent('fed_celebration_shown', {
      protein_g: g || undefined,
      loot: loot === '1',
      freeze: freeze === '1',
    });
    void loadRef.current({ force: true }).catch(() => {});
    router.setParams({
      fed: undefined,
      protein: undefined,
      loot: undefined,
      freeze: undefined,
      food: undefined,
    });
    const t = setTimeout(() => setFedPulse(false), 2400);
    return () => clearTimeout(t);
  }, [fed, protein, loot, freeze, food, profile?.id]);

  function hungerDragonNameSafe() {
    if (!profile) return 'Dragon';
    return displayDragonName(profile, displayDragonId(profile, todayISODate()));
  }

  const consumed = logs.reduce((sum, l) => sum + Number(l.protein_g), 0);
  const goal = profile?.protein_goal_g ?? 0;
  const caloriesConsumed = logs.reduce((sum, l) => {
    if (l.calories != null && Number.isFinite(Number(l.calories))) {
      return sum + Math.round(Number(l.calories));
    }
    const fromItems = (Array.isArray(l.items) ? l.items : []).reduce(
      (s, i) => s + (Number(i.calories_g) || 0),
      0,
    );
    return sum + Math.round(fromItems);
  }, 0);
  const calorieAim = Math.round(resolveCalorieAim(profile));
  const hitGoal = goal > 0 && consumed >= goal;
  const showDragonInHero = heroLayout !== 'sidebar';
  const todayISO = todayISODate();
  const isViewingToday = viewedISO === todayISO;
  const isViewingFuture = viewedISO > todayISO;
  const dragonLocked = profile ? isDailyDragonLockedForToday(profile, todayISO) : false;
  const todayDragon = profile && dragonLocked ? dragonById(profile.daily_dragon_id!) : null;
  const todayDragonName =
    profile && dragonLocked
      ? displayDragonName(profile, profile.daily_dragon_id!)
      : null;
  const hunger = fedPulse ? 0 : hungerFromLastMealAt(lastMealAt, nowMs);
  const hungerDragonName = profile
    ? displayDragonName(profile, displayDragonId(profile, todayISO))
    : 'Your dragon';
  const shards = getRetention(profile).egg_shards ?? 0;

  useEffect(() => {
    if (hunger < 3 || !profile) return;
    if (starveTrackedDay.current === todayISO) return;
    starveTrackedDay.current = todayISO;
    trackEvent('starve_state_viewed', { dragon: hungerDragonName });
  }, [hunger, profile?.id, todayISO, hungerDragonName]);

  const openFeed = () => {
    trackEvent('feed_cta_tapped', { source: 'today' });
    prefetchRoute('/scan');
    router.push('/scan');
  };

  if (profile && !dragonLocked) {
    return (
      <PageCanvas>
        <SafeAreaView style={styles.safe} edges={['top']}>
          <View
            style={[
              flexFill,
              contentColumnStyle({ horizontalPad, maxWidth: contentMaxWidth }),
            ]}>
            <DailyDragonPicker />
          </View>
        </SafeAreaView>
      </PageCanvas>
    );
  }

  async function handleDelete(log: ProteinLog) {
    if (deletingId) return;
    const previousLogs = logs;
    const previousLastMealAt = lastMealAt;
    const previousLifetime = lifetimeMeals;
    const remainingLogs = logs.filter((l) => l.id !== log.id);
    const todayTotalAfter = remainingLogs.reduce((s, l) => s + Number(l.protein_g), 0);

    setDeletingId(log.id);
    setPendingDelete(null);
    setLogs(remainingLogs);
    setLifetimeMeals((n) => Math.max(0, n - 1));
    if (profile?.id) {
      invalidateTodayHomeCache(profile.id);
      writeTodayHomeLogs(profile.id, viewedISO, remainingLogs);
    }

    try {
      await deleteLog(log.id);
      if (profile) {
        const updates = applyDeleteLogToCharacter({
          profile,
          deletedProteinG: Number(log.protein_g),
          todayTotalAfterDelete: todayTotalAfter,
          todayISO: viewedISO,
        });
        await saveProfile(updates);
      }
      setDayTotals((prev) => ({
        ...prev,
        [viewedISO]: todayTotalAfter,
      }));
      const latest = await fetchLatestMealAt();
      setLastMealAt(latest);
    } catch (e) {
      console.error('Failed to delete log:', e);
      setLogs(previousLogs);
      setLastMealAt(previousLastMealAt);
      setLifetimeMeals(previousLifetime);
      if (Platform.OS === 'web') {
        window.alert('Could not delete. Please try again.');
      }
    } finally {
      setDeletingId(null);
    }
  }

  const viewedDate = new Date(`${viewedISO}T12:00:00`);
  const dateLabel = viewedDate
    .toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
    .toUpperCase();
  const loggedOnLabel = viewedDate.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
  const yesterdayISO = todayISODate(-1);
  const dayTitle = isViewingToday
    ? 'Today'
    : viewedISO === yesterdayISO
      ? 'Yesterday'
      : viewedDate.toLocaleDateString(undefined, { weekday: 'long' });
  const proteinRingLabel = isViewingToday
    ? 'PROTEIN TODAY'
    : isViewingFuture
      ? 'PROTEIN'
      : 'PROTEIN THAT DAY';
  const sectionTitle = isViewingToday
    ? 'LOGGED TODAY'
    : isViewingFuture
      ? 'NOTHING YET'
      : `Logged on ${loggedOnLabel}`;

  function renderHeader() {
    return (
      <View style={headerTopPad > 0 ? { paddingTop: headerTopPad } : undefined}>
        <View style={styles.header}>
          <View style={styles.headerLead}>
            <Pressable
              onPress={() => router.push(isPro(profile) ? '/settings' : '/paywall')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={
                isPro(profile) ? 'Pro account. Open settings' : 'Free account. Upgrade to Pro'
              }
              style={[
                styles.statusTag,
                isPro(profile) ? styles.statusTagPro : styles.statusTagFree,
                pressableWeb,
              ]}>
              {isPro(profile) ? (
                <Ionicons name="sparkles" size={10} color={colors.bg} />
              ) : null}
              <Text
                selectable={false}
                style={[
                  styles.statusTagText,
                  isPro(profile) ? styles.statusTagTextPro : styles.statusTagTextFree,
                ]}>
                {isPro(profile) ? 'PRO' : 'FREE'}
              </Text>
            </Pressable>
            <Text style={styles.eyebrow} numberOfLines={1}>
              {dateLabel}
            </Text>
            <Text
              style={[
                styles.title,
                {
                  fontSize: isNarrow ? Math.min(titleSize, 36) : titleSize,
                  lineHeight: displayLH(isNarrow ? Math.min(titleSize, 36) : titleSize),
                },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}>
              {dayTitle}
            </Text>
          </View>
          <View style={styles.headerDivider} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
          <WeekDateStrip
            selectedISO={viewedISO}
            goalG={goal}
            totals={dayTotals}
            liveISO={viewedISO}
            liveProteinG={consumed}
            compact={isNarrow}
            onSelect={(iso) => {
              const today = todayISODate();
              if (iso > today) return;
              if (iso === viewedISO) return;
              trackEvent('today_day_selected', {
                date: iso,
                is_today: iso === today,
              });
              setViewedISO(iso);
            }}
          />
        </View>

        {profile ? (
          <TrainerRankCard
            profile={profile}
            variant="rich"
            onPress={() => router.push('/league')}
          />
        ) : null}

        {!hasUnlimitedScans(profile) && scansLeft !== null ? (
          <Pressable onPress={() => router.push('/paywall')} style={styles.scansPill}>
            <Ionicons name="sparkles" size={14} color={colors.accent} />
            <Text style={styles.scansPillText}>
              {scansLeft > 0
                ? `${scansLeft} free scan${scansLeft === 1 ? '' : 's'} left today`
                : 'Out of free scans. Go Pro'}
            </Text>
          </Pressable>
        ) : null}

        {todayDragon && todayDragonName ? (
          <View
            style={[
              styles.dailyBanner,
              {
                borderColor: `${todayDragon.accent}99`,
                backgroundColor: `${todayDragon.accent}12`,
                shadowColor: todayDragon.accent,
              },
            ]}>
            <Ionicons name="lock-closed" size={12} color={todayDragon.accent} />
            <Text style={[styles.dailyBannerText, { color: todayDragon.accent }]}>
              Growing {todayDragonName} today
            </Text>
          </View>
        ) : null}

        <View
          style={[
            styles.hero,
            heroLayout === 'split' && { flexDirection: 'row', gap: columnGap, alignItems: 'flex-start' },
          ]}>
          <View
            style={[
              styles.proteinBlock,
              heroLayout === 'split' && { flex: 1 },
            ]}>
            <ProgressRing
              consumed={consumed}
              goal={goal}
              size={ringSize}
              label={proteinRingLabel}
            />
            {goal <= 0 ? (
              <Text style={styles.proteinMeta}>set your goal in settings</Text>
            ) : hitGoal ? (
              <Text style={styles.proteinMeta}>
                {isViewingToday
                  ? 'goal complete - your dragon is fed'
                  : 'goal complete for this day'}
              </Text>
            ) : isViewingToday && hunger >= 2 ? (
              <Text style={styles.proteinMeta}>
                {hungerVoice(hunger, profile?.display_name)}
              </Text>
            ) : isViewingFuture ? (
              <Text style={styles.proteinMeta}>future day - nothing logged yet</Text>
            ) : null}
          </View>

          {profile && showDragonInHero ? (
            <Animated.View
              entering={FadeInDown.delay(100).duration(440)}
              style={heroLayout === 'split' ? { flex: 1 } : undefined}>
              <CharacterCard
                profile={profile}
                dragonLocked
                hunger={hunger}
                fedPulse={fedPulse}
                onFeedPress={openFeed}
                dailyTotals={dayTotals}
              />
            </Animated.View>
          ) : null}
        </View>

        {isViewingToday ? (
          <FeedQuest
            dragonName={hungerDragonName}
            mealsToday={logs.length}
            consumed={consumed}
            goal={goal}
          />
        ) : null}
        {shards > 0 && isViewingToday ? (
          <Text style={styles.proteinMeta}>
            {shards} egg shard{shards === 1 ? '' : 's'} collected
          </Text>
        ) : null}

        <View style={styles.rule} />

        {logs.length > 0 ? (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{sectionTitle}</Text>
            <View
              style={styles.sectionCalRow}
              accessibilityLabel={`${caloriesConsumed} of ${calorieAim} kilocalories`}>
              <Text style={styles.sectionCalTotal}>{caloriesConsumed}</Text>
              <Text style={styles.sectionCalAim}> / {calorieAim} kcal</Text>
            </View>
          </View>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {isViewingFuture
                ? 'Nothing here yet'
                : isViewingToday
                  ? hunger >= 2
                    ? `${hungerDragonName} is starving`
                    : 'Your dragon is waiting'
                  : 'No meals logged'}
            </Text>
            <Text style={styles.emptyText}>
              {isViewingFuture
                ? 'Jump back to today to scan and feed your dragon.'
                : isViewingToday
                  ? hunger >= 2
                    ? 'Scan a meal to feed them. They dim until you do.'
                    : 'Scan your first meal - every gram of protein brings you closer.'
                  : 'No protein logged on this day.'}
            </Text>
            {isViewingToday ? (
              <Pressable
                onPress={openFeed}
                style={({ pressed }) => [
                  styles.feedEmptyCta,
                  pressableWeb,
                  pressed && { opacity: 0.85 },
                ]}>
                <Text style={styles.feedEmptyCtaText}>Feed {hungerDragonName} now</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => setViewedISO(todayISODate())}
                style={({ pressed }) => [
                  styles.feedEmptyCta,
                  pressableWeb,
                  pressed && { opacity: 0.85 },
                ]}>
                <Text style={styles.feedEmptyCtaText}>Back to today</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    );
  }

  const listProps = {
    data: logs,
    keyExtractor: (l: ProteinLog) => l.id,
    showsVerticalScrollIndicator: false as const,
    refreshControl: (
      <RefreshControl
        refreshing={refreshing}
        tintColor={colors.accent}
        onRefresh={async () => {
          setRefreshing(true);
          await load({ force: true });
          setRefreshing(false);
        }}
      />
    ),
    renderItem: ({ item, index }: { item: ProteinLog; index: number }) => (
      <View style={[styles.logItem, index > 0 && styles.logRowBorder]}>
        <View style={styles.logRow}>
          <Pressable
            onPressIn={() =>
              prefetchRoute({ pathname: '/meal/[id]', params: { id: item.id } } as never)
            }
            onPress={() =>
              router.push({ pathname: '/meal/[id]', params: { id: item.id } } as never)
            }
            accessibilityRole="button"
            accessibilityLabel={`Open analysis for ${item.food_name}`}
            style={({ pressed }) => [
              styles.logMain,
              pressableWeb,
              pressed && { opacity: 0.82 },
            ]}>
            <LogMealThumb logId={item.id} imagePath={item.image_path} />
            <View style={styles.logCopy}>
              <Text style={styles.logName} numberOfLines={2}>
                {item.food_name}
              </Text>
              <Text style={styles.logTime}>
                {new Date(item.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
            <Text style={styles.logProtein}>
              {Math.round(Number(item.protein_g))}
              <Text style={styles.logUnit}>g</Text>
              {item.calories ? (
                <Text style={styles.logCal}> ({Math.round(Number(item.calories))} cal)</Text>
              ) : null}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setDeleteModalVisible(true);
              setPendingDelete(item);
            }}
            disabled={deletingId === item.id}
            accessibilityLabel="Delete meal"
            accessibilityRole="button"
            hitSlop={10}
            style={({ pressed }) => [
              styles.deleteIconBtn,
              pressableWeb,
              pressed && { opacity: 0.55 },
              deletingId === item.id && { opacity: 0.35 },
            ]}>
            <Ionicons name="trash-outline" size={16} color={colors.textTertiary} />
          </Pressable>
        </View>
      </View>
    ),
  };

  return (
    <PageCanvas>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <FeedToast visible={!!toastMsg} message={toastMsg ?? ''} onHide={() => setToastMsg(null)} />
        <Modal
          visible={deleteModalVisible}
          transparent
          animationType="none"
          onRequestClose={() => setPendingDelete(null)}>
          <View style={styles.confirmRoot}>
            <ModalMotionLayer
              visible={!!pendingDelete}
              onExited={() => setDeleteModalVisible(false)}
              cardStyle={styles.confirmCardWrap}
              accessibilityViewIsModal
              backdrop={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dismiss"
                style={styles.confirmBackdrop}
                onPress={() => setPendingDelete(null)}
              />
              }>
              <GlassPanel modal style={styles.confirmCard}>
                <View pointerEvents="none" style={styles.confirmSheen} />
                <Text style={styles.confirmTitle}>Delete this meal?</Text>
                <Text style={styles.confirmBody}>
                  Are you sure you want to delete
                  {pendingDelete ? (
                    <>
                      {' '}
                      <Text style={styles.confirmBodyEmphasis}>
                        &quot;{pendingDelete.food_name}&quot;
                      </Text>
                      <Text style={styles.confirmBodyMeta}>
                        {' '}
                        ({Math.round(Number(pendingDelete.protein_g))}g protein)
                      </Text>
                    </>
                  ) : (
                    ' this meal'
                  )}
                  ? This cannot be undone.
                </Text>
                <View style={styles.confirmActions}>
                  <Pressable
                    onPress={() => setPendingDelete(null)}
                    accessibilityRole="button"
                    accessibilityLabel="No"
                    style={({ pressed }) => [
                      styles.confirmBtn,
                      styles.confirmBtnNo,
                      pressableWeb,
                      pressed && { opacity: 0.85 },
                    ]}>
                    <Text style={styles.confirmBtnNoText}>No</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (pendingDelete) void handleDelete(pendingDelete);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Yes"
                    style={({ pressed }) => [
                      styles.confirmBtn,
                      styles.confirmBtnYes,
                      pressableWeb,
                      pressed && { opacity: 0.9 },
                    ]}>
                    <Text style={styles.confirmBtnYesText}>Yes</Text>
                  </Pressable>
                </View>
              </GlassPanel>
            </ModalMotionLayer>
          </View>
        </Modal>
        {heroLayout === 'sidebar' ? (
          <View
            style={[
              styles.desktopShell,
              contentColumnStyle({ horizontalPad, maxWidth: contentMaxWidth }),
            ]}>
            <View style={[styles.desktopRow, { gap: columnGap }]}>
              <FlatList
                {...listProps}
                testID="today-log-list"
                style={styles.desktopMain}
                contentContainerStyle={[styles.list, { paddingBottom: tabBarScrollInset }]}
                ListHeaderComponent={renderHeader()}
              />
              {profile ? (
                <View style={[styles.desktopAside, { width: asideWidth }]}>
                  <CharacterCard
                    profile={profile}
                    dragonLocked
                    hunger={hunger}
                    fedPulse={fedPulse}
                    onFeedPress={openFeed}
                    dailyTotals={dayTotals}
                  />
                </View>
              ) : null}
            </View>
          </View>
        ) : (
          <FlatList
            {...listProps}
            testID="today-log-list"
            style={styles.listScroll}
            contentContainerStyle={[
              styles.list,
              contentColumnStyle({ horizontalPad, maxWidth: contentMaxWidth }),
              { paddingBottom: tabBarScrollInset },
            ]}
            ListHeaderComponent={renderHeader()}
          />
        )}
      </SafeAreaView>
    </PageCanvas>
  );
}

const styles = StyleSheet.create({
  safe: flexFill,
  listScroll: flexScroll,
  desktopShell: flexFill,
  desktopRow: {
    ...flexFill,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  desktopMain: { ...flexScroll, flex: 1, minWidth: 0 },
  desktopAside: {
    paddingTop: spacing.xl + 8,
    ...(Platform.OS === 'web'
      ? ({ position: 'sticky', top: 24 } as object)
      : {}),
  },
  list: { paddingTop: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  headerLead: {
    flexShrink: 0,
    maxWidth: '42%',
    paddingRight: spacing.xs,
    justifyContent: 'flex-start',
  },
  headerDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginVertical: 6,
    backgroundColor: colors.hairlineBright,
    opacity: 0.9,
  },
  statusTag: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginBottom: 8,
  },
  statusTagPro: {
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: '#FFB09D',
    shadowColor: colors.accent,
    shadowOpacity: 0.24,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  statusTagFree: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineBright,
  },
  statusTagText: {
    fontFamily: fonts.mono,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  statusTagTextPro: { color: colors.bg },
  statusTagTextFree: { color: colors.textSecondary },
  eyebrow: {
    ...type.eyebrow,
    color: colors.accent,
    marginBottom: 6,
    textShadowColor: 'rgba(255, 122, 89, 0.22)',
    textShadowRadius: 8,
  },
  title: {
    ...type.pageTitle,
  },
  scansPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 122, 89, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 122, 89, 0.28)',
  },
  scansPillText: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  dailyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderRadius: layout.fieldRadius,
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  dailyBannerText: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.35,
    textTransform: 'uppercase',
  },
  hero: {
    alignItems: 'center',
    gap: spacing.md + 12,
    width: '100%',
    marginBottom: spacing.xs,
  },
  proteinBlock: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    width: '100%',
  },
  proteinMeta: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textTertiary,
    letterSpacing: 0.3,
    marginTop: spacing.md,
    marginBottom: 8,
    textAlign: 'center',
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairlineBright,
    marginVertical: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.sm,
    width: '100%',
  },
  sectionTitle: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: colors.textTertiary,
    flexShrink: 1,
  },
  sectionCalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexShrink: 0,
  },
  sectionCalTotal: {
    fontFamily: fonts.display,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  sectionCalAim: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '400',
    color: colors.textTertiary,
    letterSpacing: 0.2,
    fontVariant: ['tabular-nums'],
  },
  empty: {
    paddingVertical: spacing.lg,
    gap: 4,
  },
  emptyTitle: { fontFamily: fonts.displayMedium, fontSize: 15, color: colors.text },
  emptyText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  feedEmptyCta: {
    marginTop: spacing.md,
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  feedEmptyCtaText: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    letterSpacing: 0.8,
    color: colors.onAccent,
    textTransform: 'uppercase',
  },
  logItem: {
    paddingTop: 14,
    paddingBottom: 10,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
    gap: spacing.sm,
  },
  logMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    gap: spacing.md,
  },
  logRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  logCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    paddingVertical: 2,
  },
  logName: {
    fontFamily: fonts.displayMedium,
    fontSize: 16,
    lineHeight: displayLH(16),
    color: colors.text,
  },
  logTime: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textTertiary,
    letterSpacing: 0.3,
  },
  logProtein: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  logUnit: { fontSize: 13, color: colors.textTertiary },
  logCal: {
    fontSize: 11,
    fontFamily: fonts.mono,
    color: colors.textTertiary,
    letterSpacing: 0.2,
    fontVariant: ['tabular-nums'],
  },
  deleteIconBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  confirmBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6, 5, 10, 0.55)',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(22px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(22px) saturate(1.4)',
        } as object)
      : null),
  },
  confirmCardWrap: {
    width: '100%',
    maxWidth: 340,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 28px 64px rgba(0,0,0,0.55)',
        } as object)
      : {
          shadowColor: '#000',
          shadowOpacity: 0.45,
          shadowRadius: 28,
          shadowOffset: { width: 0, height: 16 },
          elevation: 20,
        }),
  },
  confirmCard: {
    position: 'relative',
    padding: spacing.lg,
    gap: spacing.md,
    // Match GlassPanel radius so shaded fill follows the outer corners.
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  confirmSheen: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.28)',
  },
  confirmTitle: {
    fontFamily: fonts.displayHeavy,
    fontSize: 18,
    lineHeight: displayLH(18),
    color: colors.text,
    textAlign: 'center',
  },
  confirmBody: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  confirmBodyEmphasis: {
    fontFamily: fonts.displayHeavy,
    fontSize: 14,
    color: colors.text,
  },
  confirmBodyMeta: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textTertiary,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: spacing.xs,
  },
  confirmBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: radius.sm,
  },
  confirmBtnNo: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  confirmBtnYes: {
    backgroundColor: colors.accent,
  },
  confirmBtnNoText: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.textSecondary,
  },
  confirmBtnYesText: {
    fontFamily: fonts.displayHeavy,
    fontSize: 15,
    color: '#1A0F0C',
  },
});
