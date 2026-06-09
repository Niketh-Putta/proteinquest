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
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProgressRing } from '@/components/ProgressRing';
import { deleteLog, fetchLogsForDate } from '@/lib/api';
import { todayISODate } from '@/lib/protein';
import { useSession } from '@/lib/session';
import type { ProteinLog } from '@/lib/types';
import { colors, fonts, radius, spacing } from '@/theme';

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
    Alert.alert('Delete entry?', `Remove "${log.food_name}" (${Math.round(Number(log.protein_g))}g)?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteLog(log.id);
          load();
        },
      },
    ]);
  }

  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={logs}
        keyExtractor={(l) => l.id}
        contentContainerStyle={styles.list}
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
          <View style={styles.header}>
            <Text style={styles.date}>{dateLabel}</Text>
            <Text style={styles.title}>Today&apos;s protein</Text>
            <View style={styles.ringWrap}>
              <ProgressRing consumed={consumed} goal={goal} />
            </View>
            {logs.length > 0 ? (
              <Text style={styles.sectionTitle}>Logged meals</Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="camera-outline" size={40} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>Nothing logged yet</Text>
            <Text style={styles.emptyText}>
              Snap a photo of your next meal and we&apos;ll count the protein for you.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable onLongPress={() => confirmDelete(item)} style={styles.logRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.logName} numberOfLines={1}>
                {item.food_name}
              </Text>
              <Text style={styles.logTime}>
                {new Date(item.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {item.confidence ? `  \u00B7  ${item.confidence} confidence` : ''}
              </Text>
            </View>
            <Text style={styles.logProtein}>
              {Math.round(Number(item.protein_g))}
              <Text style={styles.logUnit}>g</Text>
            </Text>
          </Pressable>
        )}
      />

      <Pressable style={styles.fab} onPress={() => router.push('/snap')}>
        <Ionicons name="camera" size={26} color={colors.accentText} />
        <Text style={styles.fabLabel}>Snap meal</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg, paddingBottom: 120 },
  header: { alignItems: 'stretch' },
  date: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.text,
    marginTop: 4,
    fontFamily: fonts?.rounded,
  },
  ringWrap: { alignItems: 'center', marginVertical: spacing.xl },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  empty: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 260,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  logName: { fontSize: 16, fontWeight: '700', color: colors.text },
  logTime: { fontSize: 13, color: colors.textTertiary, marginTop: 2 },
  logProtein: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.accent,
    fontVariant: ['tabular-nums'],
  },
  logUnit: { fontSize: 15, color: colors.accentDark },
  fab: {
    position: 'absolute',
    bottom: spacing.lg,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    height: 56,
    borderRadius: radius.full,
    shadowColor: colors.accent,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  fabLabel: { fontSize: 16, fontWeight: '800', color: colors.accentText },
});
