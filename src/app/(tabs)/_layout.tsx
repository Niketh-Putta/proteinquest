import { Ionicons } from '@expo/vector-icons';
import { router, Tabs } from 'expo-router';
import React, { useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isDailyDragonLockedForToday } from '@/lib/character';
import {
  getDailyDragonLockEpoch,
  subscribeDailyDragonLock,
} from '@/lib/daily-dragon-lock';
import { useLayout } from '@/lib/layout';
import {
  hasUnlimitedScans,
  shouldOpenPaywallFromScanTap,
} from '@/lib/paywall-gate';
import { countLifetimeMeals, countTodayPhotoScans } from '@/lib/api';
import { todayISODate } from '@/lib/protein';
import { useSession } from '@/lib/session';
import { useSpecialDeviceLayout } from '@/lib/special-device';
import { colors, fonts, noTextCaret, pressableWeb, spacing } from '@/theme';

interface TabBarProps {
  state: { index: number };
  navigation: { navigate: (name: string) => void };
}

function ScanTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { contentMaxWidth, isWide } = useLayout();
  const special = useSpecialDeviceLayout();
  const { profile } = useSession();
  useSyncExternalStore(subscribeDailyDragonLock, getDailyDragonLockEpoch, getDailyDragonLockEpoch);

  function openScan() {
    if (profile && !isDailyDragonLockedForToday(profile, todayISODate())) {
      router.push('/(tabs)/today');
      return;
    }
    if (profile && !hasUnlimitedScans(profile)) {
      Promise.all([countTodayPhotoScans(), countLifetimeMeals()])
        .then(([used, life]) => {
          if (shouldOpenPaywallFromScanTap(profile, used, life)) router.push('/paywall');
          else router.push('/scan');
        })
        .catch(() => router.push('/scan'));
      return;
    }
    router.push('/scan');
  }

  function openTrends() {
    navigation.navigate('trends');
  }
  const tabs = {
    today: { name: 'today', label: 'Today', icon: 'flash' as const },
    trends: { name: 'trends', label: 'Progress', icon: 'stats-chart' as const },
    league: { name: 'league', label: 'League', icon: 'trophy' as const },
    profile: { name: 'profile', label: 'Profile', icon: 'person' as const },
  };

  return (
    <View
      style={[
        styles.barOuter,
        {
          paddingBottom: Math.max(insets.bottom, special.isSquatWindow ? 6 : 12),
          paddingTop: special.isSquatWindow ? 4 : 10,
        },
        special.isUltraCompact && { paddingHorizontal: spacing.md },
      ]}>
      <View
        style={[
          styles.bar,
          isWide && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' },
        ]}>
        <TabButton
          tab={tabs.today}
          active={state.index === 0}
          onPress={() => navigation.navigate('today')}
          compact={special.isSpecial}
        />
        <TabButton
          tab={tabs.trends}
          active={state.index === 1}
          onPress={openTrends}
          compact={special.isSpecial}
        />

        <Pressable
          accessibilityRole="button"
          onPress={openScan}
          style={({ pressed }) => [
            styles.scanTab,
            special.isSquatWindow && styles.scanTabCompact,
            pressableWeb,
            pressed && { transform: [{ scale: 0.94 }] },
          ]}>
          <View style={[styles.scanBtn, special.isSquatWindow && styles.scanBtnCompact]}>
            <Ionicons name="add" size={special.isSquatWindow ? 24 : 28} color={colors.onAccent} />
          </View>
          {!special.isUltraCompact ? (
            <Text selectable={false} style={styles.scanLabel}>
              Add
            </Text>
          ) : null}
        </Pressable>

        <TabButton
          tab={tabs.league}
          active={state.index === 2}
          onPress={() => navigation.navigate('league')}
          compact={special.isSpecial}
        />
        <TabButton
          tab={tabs.profile}
          active={state.index === 3}
          onPress={() => navigation.navigate('profile')}
          compact={special.isSpecial}
        />
      </View>
    </View>
  );
}

function TabButton({
  tab,
  active,
  onPress,
  compact = false,
}: {
  tab: { label: string; icon: keyof typeof Ionicons.glyphMap };
  active: boolean;
  onPress: () => void;
  /** Only true on fold/split/cover — normal phones keep labels. */
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.tab, compact && styles.tabCompact, pressableWeb]}>
      <Ionicons
        name={tab.icon}
        size={compact ? 18 : 20}
        color={active ? colors.text : colors.textTertiary}
      />
      {!compact ? (
        <Text selectable={false} style={[styles.tabLabel, active && styles.tabLabelActive]}>
          {tab.label}
        </Text>
      ) : null}
      {active ? <View style={styles.tabIndicator} /> : null}
    </Pressable>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="today"
      tabBar={(props) => <ScanTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { flex: 1, minHeight: 0, backgroundColor: colors.bg },
      }}>
      <Tabs.Screen name="today" />
      <Tabs.Screen name="trends" />
      <Tabs.Screen name="league" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  barOuter: {
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairlineBright,
    paddingTop: 10,
    paddingHorizontal: spacing.lg,
    width: '100%',
    alignItems: 'center',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    width: '100%',
  },
  tab: { flex: 1, alignItems: 'center', gap: 4, minHeight: 44, paddingBottom: 2 },
  tabCompact: { gap: 0, minHeight: 40 },
  tabLabel: {
    ...noTextCaret,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.textTertiary,
  },
  tabLabelActive: { color: colors.text, fontFamily: fonts.monoBold },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    width: 20,
    height: 2,
    backgroundColor: colors.accent,
  },
  scanTab: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    paddingBottom: 2,
  },
  scanTabCompact: {
    gap: 0,
    minHeight: 40,
  },
  scanBtn: {
    width: 64,
    height: 64,
    minWidth: 44,
    minHeight: 44,
    borderRadius: 32,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -22,
    borderWidth: 3,
    borderColor: colors.bg,
  },
  scanBtnCompact: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginTop: -14,
  },
  scanLabel: {
    ...noTextCaret,
    fontFamily: fonts.monoBold,
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.accent,
  },
});
