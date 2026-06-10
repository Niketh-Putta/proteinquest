import { Ionicons } from '@expo/vector-icons';
import { router, Tabs } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isDailyDragonLockedForToday } from '@/lib/character';
import { useLayout } from '@/lib/layout';
import { todayISODate } from '@/lib/protein';
import { useSession } from '@/lib/session';
import { colors, fonts, shadowAccent, spacing } from '@/theme';

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
    router.push('/scan');
  }
  const tabs = [
    { name: 'today', label: 'Today', icon: 'flash' as const },
    { name: 'trends', label: 'Trends', icon: 'stats-chart' as const },
  ];

  return (
    <View style={[styles.barOuter, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View
        style={[styles.bar, isWide && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}>
        <TabButton
          tab={tabs[0]}
          active={state.index === 0}
          onPress={() => navigation.navigate('today')}
        />

        <Pressable
          onPress={openScan}
          style={({ pressed }) => [styles.scanTab, pressed && { transform: [{ scale: 0.94 }] }]}>
          <View style={styles.scanBtn}>
            <Ionicons name="scan" size={24} color={colors.onAccent} />
          </View>
          <Text style={styles.scanLabel}>Scan</Text>
        </Pressable>

        <TabButton
          tab={tabs[1]}
          active={state.index === 1}
          onPress={() => navigation.navigate('trends')}
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
    <Pressable onPress={onPress} style={styles.tab}>
      <Ionicons name={tab.icon} size={20} color={active ? colors.text : colors.textTertiary} />
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
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
        sceneStyle: { flex: 1, backgroundColor: colors.bg },
      }}>
      <Tabs.Screen name="today" />
      <Tabs.Screen name="trends" />
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
    justifyContent: 'space-around',
  },
  tab: { alignItems: 'center', gap: 4, width: 72, minHeight: 44, paddingBottom: 2 },
  tabLabel: {
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
    alignItems: 'center',
    gap: 4,
    width: 72,
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
    ...shadowAccent,
  },
  scanLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.accent,
  },
});
