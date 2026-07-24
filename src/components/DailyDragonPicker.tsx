import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { DragonPicker } from '@/components/DragonPicker';
import { StickyFooter } from '@/components/StickyFooter';
import { lockDailyDragon } from '@/lib/character';
import { useLayout } from '@/lib/layout';
import { todayISODate } from '@/lib/protein';
import { useSession } from '@/lib/session';
import type { DragonId } from '@/lib/types';
import { colors, displayLH, fonts, layout, pressableWeb, spacing } from '@/theme';

export function DailyDragonPicker() {
  const { isNarrow, height, width } = useLayout();
  const isCompact = height < 700 || width < 390;
  const { profile, saveProfile } = useSession();
  const [dragonId, setDragonId] = useState<DragonId | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = !!dragonId && !saving;
  const scrollFooterPad =
    (isCompact ? layout.controlHeightCompact : layout.controlHeight) + spacing.xl;

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
        contentContainerStyle={[
          styles.scroll,
          isCompact && styles.scrollCompact,
          { paddingBottom: scrollFooterPad },
        ]}
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
          <DragonPicker
            value={dragonId}
            onChange={setDragonId}
            profile={profile}
            compact
            tight={isCompact}
          />
        </Animated.View>
      </ScrollView>

      <StickyFooter tabScreen compact={isCompact}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          onPress={confirm}
          disabled={!dragonId || saving}
          accessibilityRole="button"
          accessibilityLabel="Lock in for today"
          style={({ pressed }) => [
            styles.lockOuter,
            ready && styles.lockOuterReady,
            pressed && ready && styles.lockOuterPressed,
            pressableWeb,
          ]}>
          <LinearGradient
            colors={
              ready
                ? ['#FF9B7A', '#FF7A59', '#E85F42']
                : ['rgba(255,122,89,0.28)', 'rgba(196,78,53,0.22)']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.lockInner, isCompact && styles.lockInnerCompact]}>
            {ready ? <View pointerEvents="none" style={styles.lockSheen} /> : null}
            {saving ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <View style={styles.lockLabelRow}>
                {dragonId ? (
                  <Ionicons
                    name="lock-closed"
                    size={15}
                    color={ready ? colors.onAccent : 'rgba(255,249,247,0.45)'}
                  />
                ) : null}
                <Text
                  style={[styles.lockLabel, !ready && styles.lockLabelDisabled]}
                  numberOfLines={1}>
                  Lock in for today
                </Text>
              </View>
            )}
          </LinearGradient>
        </Pressable>
      </StickyFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1, minHeight: 0 },
  scroll: { paddingTop: spacing.lg },
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
  lockOuter: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  lockOuterReady: {
    borderColor: 'rgba(255,176,144,0.45)',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow:
            '0 12px 32px rgba(255,122,89,0.32), 0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.22)',
        } as object)
      : {
          shadowColor: '#FF7A59',
          shadowOpacity: 0.35,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 10,
        }),
  },
  lockOuterPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.985 }],
  },
  lockInner: {
    height: layout.controlHeight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    position: 'relative',
  },
  lockInnerCompact: {
    height: layout.controlHeightCompact,
  },
  lockSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '48%',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  lockLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  lockLabel: {
    fontFamily: fonts.displayHeavy,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 0.2,
    color: colors.onAccent,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    ...(Platform.OS === 'android' ? { textAlignVertical: 'center' as const } : null),
  },
  lockLabelDisabled: {
    color: 'rgba(255,249,247,0.45)',
  },
  error: { fontFamily: fonts.body, fontSize: 13, color: colors.danger, marginBottom: spacing.sm },
});
