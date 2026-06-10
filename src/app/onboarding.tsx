import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountCard } from '@/components/AccountCard';
import { GoalEditor } from '@/components/GoalEditor';
import { STAGES } from '@/lib/character';
import { useSession } from '@/lib/session';
import type { Profile } from '@/lib/types';
import { colors, fonts, spacing, type } from '@/theme';

export default function Onboarding() {
  const { saveProfile } = useSession();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(updates: Partial<Profile>) {
    setSaving(true);
    setError(null);
    try {
      await saveProfile(updates);
      router.replace('/(tabs)/today');
    } catch (e: any) {
      setError(e.message ?? 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.springify().damping(16)}>
            <Text style={styles.kicker}>PROTEINLENS</Text>
            <Text style={styles.title}>One number.{'\n'}Every day.</Text>
            <Text style={styles.subtitle}>
              Four quick questions and we&apos;ll calculate exactly how much protein your
              body needs {'\u2014'} with the reasoning behind it.
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(100).springify().damping(16)}>
            <AccountCard />
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(140).springify().damping(16)}
            style={styles.wheyRow}>
            <Image source={STAGES[0].art} style={styles.wheyArt} />
            <View style={{ flex: 1 }}>
              <Text style={styles.wheyName}>This is Whey.</Text>
              <Text style={styles.wheyText}>
                Your protein buddy. Hit your daily goal and watch him grow from hatchling
                to titan.
              </Text>
            </View>
          </Animated.View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Animated.View entering={FadeInDown.delay(240).springify().damping(16)}>
            <GoalEditor
              profile={null}
              submitLabel="Start tracking"
              saving={saving}
              onSubmit={handleSubmit}
            />
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  kicker: { ...type.label, color: colors.accent, marginTop: spacing.md },
  title: {
    fontFamily: fonts.displayHeavy,
    fontSize: 40,
    lineHeight: 46,
    color: colors.text,
    marginTop: spacing.sm,
  },
  subtitle: { ...type.body, marginTop: spacing.md, maxWidth: 320 },
  wheyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 22,
    padding: spacing.md,
    marginTop: spacing.xl,
  },
  wheyArt: { width: 84, height: 84, borderRadius: 16 },
  wheyName: { fontFamily: fonts.display, fontSize: 16, color: colors.text },
  wheyText: { ...type.body, fontSize: 13, marginTop: 4 },
  error: { fontFamily: fonts.body, fontSize: 13, color: colors.danger, marginTop: spacing.md },
});
