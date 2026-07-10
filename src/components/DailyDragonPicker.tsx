import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Button } from '@/components/Button';
import { DragonPicker } from '@/components/DragonPicker';
import { lockDailyDragon } from '@/lib/character';
import { useLayout, usePinnedFooterGap } from '@/lib/layout';
import { todayISODate } from '@/lib/protein';
import { useSession } from '@/lib/session';
import type { DragonId } from '@/lib/types';
import { colors, displayLH, fonts, spacing } from '@/theme';

export function DailyDragonPicker() {
  const { isNarrow, height, width } = useLayout();
  const isCompact = height < 700 || width < 390;
  const footerGap = usePinnedFooterGap(isCompact);
  const { profile, saveProfile } = useSession();
  const [dragonId, setDragonId] = useState<DragonId | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!profile || !dragonId) {
      setError('Choose a dragon to grow today.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveProfile(lockDailyDragon(profile, dragonId, todayISODate()));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not save. Try again.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scroll, isCompact && styles.scrollCompact]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces>
        <Animated.View entering={FadeInDown.duration(420)}>
          <Text style={[styles.kicker, isCompact && styles.kickerCompact]}>NEW DAY</Text>
          <Text
            style={[
              styles.title,
              isNarrow && styles.titleNarrow,
              isCompact && styles.titleCompact,
            ]}>
            Who are you growing today?
          </Text>
          <Text style={[styles.sub, isCompact && styles.subCompact]}>
            Pick one dragon for today. All protein you log counts toward them only - locked until
            tomorrow.
          </Text>
          <DragonPicker value={dragonId} onChange={setDragonId} compact tight={isCompact} />
        </Animated.View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: footerGap }]}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          title="Lock in for today"
          onPress={confirm}
          loading={saving}
          disabled={!dragonId}
          style={isCompact ? styles.btnCompact : undefined}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scroll: { paddingTop: spacing.lg, paddingBottom: spacing.sm },
  scrollCompact: { paddingTop: spacing.md },
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 3.5,
    color: colors.accentSecondary,
  },
  kickerCompact: { fontSize: 8, letterSpacing: 2.5 },
  title: {
    fontFamily: fonts.displayHeavy,
    fontSize: 32,
    lineHeight: displayLH(32),
    color: colors.text,
    letterSpacing: -0.8,
    marginTop: spacing.sm,
  },
  titleNarrow: { fontSize: 26, lineHeight: displayLH(26), letterSpacing: -0.5 },
  titleCompact: { fontSize: 24, lineHeight: displayLH(24), marginTop: spacing.xs },
  sub: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  subCompact: { fontSize: 13, lineHeight: 19, marginTop: spacing.xs, marginBottom: spacing.sm },
  footer: {
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    backgroundColor: colors.bg,
  },
  btnCompact: { height: 44 },
  error: { fontFamily: fonts.body, fontSize: 13, color: colors.danger, marginBottom: spacing.sm },
});
