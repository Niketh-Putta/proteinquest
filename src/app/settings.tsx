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

import { AccountCard } from '@/components/AccountCard';
import { DragonRoster } from '@/components/DragonRoster';
import { GoalEditor } from '@/components/GoalEditor';
import { useLayout } from '@/lib/layout';
import { useSession } from '@/lib/session';
import type { Profile } from '@/lib/types';
import { colors, fonts, spacing, type } from '@/theme';

function goHome() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/today');
}

export default function SettingsScreen() {
  const { profile, saveProfile } = useSession();
  const { contentWidth, horizontalPad } = useLayout();
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
        <Pressable onPress={goHome} hitSlop={12} style={styles.roundBtn}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle}>YOUR GOAL</Text>
        <View style={{ width: 40 }} />
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingHorizontal: horizontalPad, width: contentWidth, maxWidth: 428, alignSelf: 'center' },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <AccountCard />
          {profile ? <DragonRoster profile={profile} /> : null}
          <Text style={styles.subtitle}>
            Adjust your stats and the target recalculates with full reasoning.
          </Text>
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
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: { ...type.label, color: colors.textSecondary, fontSize: 12 },
  scroll: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  subtitle: { ...type.body, fontSize: 13.5 },
  error: { fontFamily: fonts.body, fontSize: 13, color: colors.danger, marginTop: spacing.sm },
});
