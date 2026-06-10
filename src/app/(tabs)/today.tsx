import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CharacterCard } from '@/components/CharacterCard';
import { ProgressRing } from '@/components/ProgressRing';
import { deleteLog, fetchLogsForDate } from '@/lib/api';
import { todayISODate } from '@/lib/protein';
import { useSession } from '@/lib/session';
import type { ProteinLog } from '@/lib/types';
import { colors, fonts, radius, spacing, type } from '@/theme';

export default function TodayScreen() {
  const { profile } = useSession();
  const [logs, setLogs] = useState<ProteinLog[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setLogs(await fetchLogsForDate(todayISODate()));
    } catch (e) {
      console.error('Failed to load logs:', e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const consumed = logs.reduce((sum, l) => sum + Number(l.protein_g), 0);
  const goal = profile?.protein_goal_g ?? 0;

  function confirmDelete(log: ProteinLog) {
    Alert.alert(
      'Delete entry?',
      `Remove "${log.food_name}" (${Math.round(Number(log.protein_g))}g)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteLog(log.id);
            load();
          },
        },
      ],
    );
  }

  const dateLabel = new Date()
    .toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
    .toUpperCase();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={logs}
        keyExtractor={(l) => l.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.accent}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View>
                <Text style={styles.date}>{dateLabel}</Text>
                <Text style={styles.wordmark}>
                  Protein<Text style={{ color: colors.accent }}>Lens</Text>
                </Text>
              </View>
              <Pressable
                onPress={() => router.push('/settings')}
                hitSlop={10}
                style={styles.gearBtn}>
                <Ionicons name="options-outline" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.ringWrap}>
              <ProgressRing consumed={consumed} goal={goal} />
            </View>

            {profile ? (
              <Animated.View entering={FadeInDown.delay(150).springify().damping(16)}>
                <CharacterCard profile={profile} />
              </Animated.View>
            ) : null}

            {logs.length > 0 ? <Text style={styles.sectionTitle}>LOGGED TODAY</Text> : null}
          </View>
        }
        ListEmptyComponent={
          <Animated.View entering={FadeInDown.delay(280)} style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="scan-outline" size={26} color={colors.accent} />
            </View>
            <Text style={styles.emptyTitle}>No meals logged yet</Text>
            <Text style={styles.emptyText}>
              Tap the scan button and point it at your food {'\u2014'} Whey gets stronger
              every time you hit your goal.
            </Text>
          </Animated.View>
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(80 * Math.min(index, 5)).springify().damping(16)}>
            <Pressable onLongPress={() => confirmDelete(item)} style={styles.logRow}>
              <View style={styles.logDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.logName} numberOfLines={1}>
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
              </Text>
            </Pressable>
          </Animated.View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  date: { ...type.label, color: colors.accent },
  wordmark: { fontFamily: fonts.displayHeavy, fontSize: 24, color: colors.text, marginTop: 2 },
  gearBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringWrap: { alignItems: 'center', marginVertical: spacing.lg },
  sectionTitle: { ...type.label, marginTop: spacing.lg, marginBottom: spacing.sm },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  emptyIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.accentDeep,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.text },
  emptyText: {
    ...type.body,
    fontSize: 13.5,
    textAlign: 'center',
    maxWidth: 280,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  logDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  logName: { fontFamily: fonts.displayMedium, fontSize: 15, color: colors.text },
  logTime: { fontFamily: fonts.mono, fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  logProtein: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: colors.accent,
    fontVariant: ['tabular-nums'],
  },
  logUnit: { fontSize: 14, color: colors.accentDeep },
});
