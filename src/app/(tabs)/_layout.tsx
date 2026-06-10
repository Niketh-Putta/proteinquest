import { Ionicons } from '@expo/vector-icons';
import { router, Tabs } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, shadowAccent, spacing } from '@/theme';

interface TabBarProps {
  state: { index: number };
  navigation: { navigate: (name: string) => void };
}

function ScanTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const tabs = [
    { name: 'today', label: 'Today', icon: 'flash' as const },
    { name: 'trends', label: 'Trends', icon: 'stats-chart' as const },
  ];

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <TabButton
        tab={tabs[0]}
        active={state.index === 0}
        onPress={() => navigation.navigate('today')}
      />

      {/* center scan action — the core loop, front and center */}
      <Pressable
        onPress={() => router.push('/scan')}
        style={({ pressed }) => [styles.scanBtn, pressed && { transform: [{ scale: 0.94 }] }]}>
        <Ionicons name="scan" size={26} color={colors.onAccent} />
      </Pressable>

      <TabButton
        tab={tabs[1]}
        active={state.index === 1}
        onPress={() => navigation.navigate('trends')}
      />
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
      <Ionicons name={tab.icon} size={21} color={active ? colors.accent : colors.textTertiary} />
      <Text style={[styles.tabLabel, active && { color: colors.accent }]}>{tab.label}</Text>
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
        sceneStyle: { backgroundColor: colors.bg },
      }}>
      <Tabs.Screen name="today" />
      <Tabs.Screen name="trends" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.bgRaised,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    paddingTop: 10,
    paddingHorizontal: spacing.lg,
  },
  tab: { alignItems: 'center', gap: 3, width: 84 },
  tabLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.8,
    color: colors.textTertiary,
  },
  scanBtn: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -26,
    borderWidth: 4,
    borderColor: colors.bg,
    ...shadowAccent,
  },
});
