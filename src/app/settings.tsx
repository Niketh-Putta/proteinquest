import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DragonEvolutionGallery } from '@/components/DragonEvolutionGallery';
import { GoalEditor } from '@/components/GoalEditor';
import { dragonById, displayDragonId, isDailyDragonLockedForToday } from '@/lib/character';
import { useLayout } from '@/lib/layout';
import { todayISODate } from '@/lib/protein';
import { useSession } from '@/lib/session';
import type { Profile } from '@/lib/types';
import { colors, fonts, spacing } from '@/theme';

function goHome() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/today');
}

export default function SettingsScreen() {
  const { profile, saveProfile } = useSession();
  const { contentMaxWidth, horizontalPad, isNarrow } = useLayout();
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(updates: Partial<Profile>) {
    setSaving(true);
    setError(null);
    try {
      await saveProfile(updates);
      setSavedFlash(true);
      setTimeout(goHome, 700);
    } catch (e: any) {
      setError(e.message ?? 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={goHome} hitSlop={12} style={styles.iconBtn}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle}>SETTINGS</Text>
        <View style={{ width: 44 }} />
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            {
              paddingHorizontal: horizontalPad,
              maxWidth: contentMaxWidth,
              width: '100%',
              alignSelf: 'center',
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Text style={[styles.title, isNarrow && styles.titleNarrow]}>Preferences</Text>
          <Text style={styles.subtitle}>
            Adjust your stats and the target recalculates with full reasoning.
          </Text>

          {profile && isDailyDragonLockedForToday(profile, todayISODate()) ? (
            <View style={styles.lockedDragon}>
              <Text style={styles.lockedLabel}>TODAY&apos;S DRAGON</Text>
              <Text style={styles.lockedName}>
                {dragonById(displayDragonId(profile, todayISODate())).name}
              </Text>
              <Text style={styles.lockedHint}>Locked until tomorrow - pick again on Today.</Text>
            </View>
          ) : null}

          <DragonEvolutionGallery />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <GoalEditor
            profile={profile}
            submitLabel={savedFlash ? 'Saved \u2713' : 'Update goal'}
            saving={saving}
            onSubmit={handleSubmit}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 2.5,
    color: colors.textSecondary,
  },
  scroll: { paddingTop: spacing.md, paddingBottom: spacing.xxl },
  title: {
    fontFamily: fonts.displayHeavy,
    fontSize: 32,
    color: colors.text,
    letterSpacing: -0.8,
    marginBottom: 6,
  },
  titleNarrow: { fontSize: 26, letterSpacing: -0.5 },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  error: { fontFamily: fonts.body, fontSize: 13, color: colors.danger, marginTop: spacing.sm },
  lockedDragon: {
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairlineBright,
    gap: 4,
  },
  lockedLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: colors.accent,
  },
  lockedName: {
    fontFamily: fonts.displayMedium,
    fontSize: 15,
    color: colors.text,
  },
  lockedHint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
  },
});
