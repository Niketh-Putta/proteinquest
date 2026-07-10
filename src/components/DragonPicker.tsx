import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { DRAGONS } from '@/lib/character';
import type { DragonId } from '@/lib/types';
import { colors, displayLH, fonts, pressableWeb, radius, spacing } from '@/theme';

interface Props {
  value: DragonId | null;
  onChange: (id: DragonId) => void;
  /** Hide onboarding headers when picking daily dragon on Today. */
  compact?: boolean;
  /** Tighter cards for short viewports (daily picker on small phones). */
  tight?: boolean;
}

export function DragonPicker({ value, onChange, compact = false, tight = false }: Props) {
  function pick(id: DragonId) {
    onChange(id);
  }

  return (
    <View style={styles.wrap}>
      {!compact ? (
        <>
          <Text style={styles.kicker}>REACH YOUR POTENTIAL</Text>
          <Text style={styles.step}>STEP 1 · CHOOSE YOUR COMPANION</Text>
          <Text style={styles.title}>Who will you grow with?</Text>
          <Text style={styles.sub}>
            Lock in one dragon per day. Hit your protein goal to earn XP, level up, and evolve
            through five forms. Consistency is the unlock.
          </Text>
        </>
      ) : null}

      <View style={[styles.list, compact && { marginTop: 0 }, tight && styles.listTight]}>
        {DRAGONS.map((dragon) => {
          const active = value === dragon.id;
          return (
            <Pressable
              key={dragon.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              onPress={() => pick(dragon.id)}
              hitSlop={6}
              style={[styles.row, pressableWeb, tight && styles.rowTight, active && styles.rowActive]}>
                <View
                  style={[
                    styles.artFrame,
                    active && { borderColor: dragon.accent, backgroundColor: colors.surface },
                  ]}>
                  <Image source={dragon.previewArt} style={[styles.art, tight && styles.artTight]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, tight && styles.nameTight, active && { color: dragon.accent }]}>
                    {dragon.name}
                  </Text>
                  <Text style={[styles.titleSmall, tight && styles.titleSmallTight]}>{dragon.title}</Text>
                  <Text style={[styles.motto, tight && styles.mottoTight]}>{dragon.motto}</Text>
                </View>
                <View style={[styles.radio, active && { borderColor: dragon.accent }]}>
                  {active ? (
                    <View style={[styles.radioDot, { backgroundColor: dragon.accent }]} />
                  ) : null}
                </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 3.5,
    color: colors.accentSecondary,
  },
  step: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.accent,
    marginTop: spacing.sm,
  },
  title: {
    fontFamily: fonts.displayHeavy,
    fontSize: 34,
    lineHeight: displayLH(34),
    color: colors.text,
    letterSpacing: -1,
    marginTop: 4,
  },
  sub: {
    fontFamily: fonts.body,
    fontSize: 14,
    marginBottom: spacing.md,
    lineHeight: 21,
    color: colors.textSecondary,
  },
  list: { gap: spacing.sm, marginTop: spacing.xs },
  listTight: { gap: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  rowActive: {
    backgroundColor: colors.bgRaised,
    borderColor: colors.hairline,
  },
  rowTight: {
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  artFrame: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.hairline,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  art: { width: 64, height: 64, borderRadius: radius.sm },
  artTight: { width: 48, height: 48 },
  name: { fontFamily: fonts.display, fontSize: 17, color: colors.text },
  nameTight: { fontSize: 15 },
  titleSmall: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1.2,
    color: colors.textTertiary,
    marginTop: 2,
  },
  titleSmallTight: { fontSize: 8, letterSpacing: 1 },
  motto: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  mottoTight: { fontSize: 11, marginTop: 2 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.hairlineBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 8, height: 8, borderRadius: 4 },
});
