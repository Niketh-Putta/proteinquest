import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  DRAGONS,
  displayDragonName,
  effectiveLevel,
  getDragonArt,
  getDragonProgress,
  stageForXpLevel,
} from '@/lib/character';
import type { DragonId, Profile } from '@/lib/types';
import { colors, displayLH, fonts, layout, pressableWeb, radius, spacing } from '@/theme';

interface Props {
  value: DragonId | null;
  onChange: (id: DragonId) => void;
  profile?: Profile | null;
  /** In-memory names before profile save (e.g. intro naming phase). */
  dragonNames?: Partial<Record<DragonId, string>>;
  /** Hide onboarding headers when picking daily dragon on Today. */
  compact?: boolean;
  /** Tighter cards for short viewports (daily picker on small phones). */
  tight?: boolean;
}

export function DragonPicker({
  value,
  onChange,
  profile,
  dragonNames,
  compact = false,
  tight = false,
}: Props) {
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
          const level = profile
            ? effectiveLevel(getDragonProgress(profile, dragon.id))
            : 1;
          // Show the dragon at its current evolution stage, not always the baby.
          const stage = profile
            ? stageForXpLevel(level, dragon.id)
            : null;
          const art = stage ? getDragonArt(dragon.id, stage.index) : dragon.previewArt;
          return (
            <Pressable
              key={dragon.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={`${displayDragonName(profile, dragon.id, dragonNames)}, level ${level}`}
              onPress={() => pick(dragon.id)}
              hitSlop={6}
              style={[styles.row, pressableWeb, tight && styles.rowTight, active && styles.rowActive]}>
                <View pointerEvents="none" style={styles.rowSheen} />
                <View
                  style={[
                    styles.artFrame,
                    active && { borderColor: dragon.accent, backgroundColor: colors.surface },
                  ]}>
                  <Image source={art} style={[styles.art, tight && styles.artTight]} />
                </View>
                <View style={styles.copy}>
                  <Text style={[styles.name, tight && styles.nameTight, active && { color: dragon.accent }]}>
                    {displayDragonName(profile, dragon.id, dragonNames)}
                  </Text>
                  <Text style={[styles.titleSmall, tight && styles.titleSmallTight]}>
                    {stage ? `${stage.name.toUpperCase()} · ${dragon.title}` : dragon.title}
                  </Text>
                  <Text style={[styles.motto, tight && styles.mottoTight]}>{dragon.motto}</Text>
                </View>
                <View
                  style={[
                    styles.levelTagShell,
                    tight && styles.levelTagShellTight,
                    active && {
                      borderColor: `${dragon.accent}99`,
                      shadowColor: dragon.accent,
                      shadowOpacity: 0.35,
                      shadowRadius: 10,
                      shadowOffset: { width: 0, height: 2 },
                      elevation: 6,
                    },
                  ]}>
                  <LinearGradient
                    colors={
                      active
                        ? [`${dragon.accent}33`, '#141214', '#0C0B0D']
                        : ['#242228', '#161418', '#0E0D10']
                    }
                    locations={[0, 0.45, 1]}
                    start={{ x: 0.15, y: 0 }}
                    end={{ x: 0.9, y: 1 }}
                    style={[styles.levelTag, tight && styles.levelTagTight]}>
                    <View style={styles.levelTagSheen} />
                    <Text
                      style={[
                        styles.levelTagLabel,
                        active ? { color: dragon.accent } : null,
                      ]}>
                      LV
                    </Text>
                    <Text
                      style={[
                        styles.levelTagValue,
                        tight && styles.levelTagValueTight,
                        active ? { color: dragon.accent } : null,
                      ]}>
                      {level}
                    </Text>
                  </LinearGradient>
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
    minHeight: layout.iconBtn,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  rowSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  rowActive: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.20)',
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
  copy: { flex: 1, minWidth: 0, paddingRight: 4 },
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
  levelTagShell: {
    minWidth: layout.iconBtn,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
    backgroundColor: '#0E0D10',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.45,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  levelTagShellTight: {
    minWidth: 42,
    borderRadius: 10,
  },
  levelTag: {
    alignSelf: 'stretch',
    paddingHorizontal: 10,
    paddingTop: 7,
    paddingBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  levelTagTight: {
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 5,
  },
  levelTagSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  levelTagLabel: {
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.48)',
    fontWeight: '600',
  },
  levelTagValue: {
    fontFamily: fonts.displayHeavy,
    fontSize: 17,
    lineHeight: 19,
    color: colors.text,
    letterSpacing: -0.4,
    marginTop: 1,
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  levelTagValueTight: { fontSize: 15, lineHeight: 17 },
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
