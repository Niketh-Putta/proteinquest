import { Ionicons } from '@expo/vector-icons';
import { router, Tabs } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isDailyDragonLockedForToday } from '@/lib/character';
import { useLayout } from '@/lib/layout';
import { canScan } from '@/lib/paywall-gate';
import { countTodayPhotoScans } from '@/lib/api';
import { todayISODate } from '@/lib/protein';
import { useSession } from '@/lib/session';
import { colors, fonts, noTextCaret, pressableWeb, spacing } from '@/theme';

interface TabBarProps {
  state: { index: number };
  navigation: { navigate: (name: string) => void };
}

function ScanTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { contentMaxWidth, isWide } = useLayout();
  const { profile } = useSession();

  function openScan() {
    if (profile && !isDailyDragonLockedForToday(profile, todayISODate())) {
      router.push('/(tabs)/today');
      return;
    }
    if (profile && !profile.is_premium) {
      countTodayPhotoScans()
        .then((used) => {
          if (!canScan(profile, used)) router.push('/paywall');
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
    trends: { name: 'trends', label: 'Trends', icon: 'stats-chart' as const },
    league: { name: 'league', label: 'League', icon: 'trophy' as const },
  };

  return (
    <View style={[styles.barOuter, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View
        style={[styles.bar, isWide && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}>
        <TabButton
          tab={tabs.today}
          active={state.index === 0}
          onPress={() => navigation.navigate('today')}
        />
        <TabButton
          tab={tabs.trends}
          active={state.index === 1}
          onPress={openTrends}
        />

        <Pressable
          accessibilityRole="button"
          onPress={openScan}
          style={({ pressed }) => [
            styles.scanTab,
            pressableWeb,
            pressed && { transform: [{ scale: 0.94 }] },
          ]}>
          <View style={styles.scanBtn}>
            <Ionicons name="scan" size={24} color={colors.onAccent} />
          </View>
          <Text selectable={false} style={styles.scanLabel}>
            Scan
          </Text>
        </Pressable>

        <TabButton
          tab={tabs.league}
          active={state.index === 2}
          onPress={() => navigation.navigate('league')}
        />
      </View>
    </View>
  );
}

function TabButton({
  tab,
  active,
  onPress,
}: {
  tab: { label: string; icon: keyof typeof Ionicons.glyphMap };
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.tab, pressableWeb]}>
      <Ionicons name={tab.icon} size={20} color={active ? colors.text : colors.textTertiary} />
      <Text
        selectable={false}
        style={[styles.tabLabel, active && styles.tabLabelActive]}>
        {tab.label}
      </Text>
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
  scanLabel: {
    ...noTextCaret,
    fontFamily: fonts.monoBold,
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.accent,
  },
});
