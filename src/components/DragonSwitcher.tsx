import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import {
  DRAGONS,
  activeDragonId,
  effectiveLevel,
  getDragonProgress,
  stageForXpLevel,
  switchActiveDragon,
} from '@/lib/character';
import { useSession } from '@/lib/session';
import type { DragonId, Profile } from '@/lib/types';
import { colors, fonts, spacing, type } from '@/theme';

interface Props {
  profile: Profile;
  variant?: 'chips' | 'cards';
  /** When true, switching is disabled (daily lock). */
  locked?: boolean;
}

export function DragonSwitcher({ profile, variant = 'chips', locked = false }: Props) {
  const { saveProfile } = useSession();
  const [busy, setBusy] = useState<DragonId | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const active = activeDragonId(profile);

  async function selectDragon(id: DragonId) {
    if (locked || id === active || busy) return;
    setBusy(id);
    try {
      const dragon = DRAGONS.find((d) => d.id === id)!;
      await saveProfile(switchActiveDragon(profile, id));
      setToast(`Training ${dragon.name}`);
      setTimeout(() => setToast(null), 1800);
    } finally {
      setBusy(null);
    }
  }

  if (variant === 'cards') {
    return (
      <View style={styles.wrap}>
        <Text style={styles.label}>{locked ? 'YOUR DRAGONS' : 'SWITCH DRAGON'}</Text>
        <View style={styles.cardList}>
          {DRAGONS.map((dragon, i) => {
            const prog = getDragonProgress(profile, dragon.id);
            const stage = stageForXpLevel(effectiveLevel(prog), dragon.id);
            const isActive = active === dragon.id;
            return (
              <Pressable
                key={dragon.id}
                onPress={() => selectDragon(dragon.id)}
                disabled={locked}
                style={[styles.cardRow, i > 0 && styles.cardRowBorder]}>
                <View style={[styles.accentBar, isActive && { backgroundColor: dragon.accent }]} />
                <Image source={stage.art} style={styles.cardArt} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardName, isActive && { color: dragon.accent }]}>
                    {dragon.name}
                  </Text>
                  <Text style={styles.cardMeta}>
                    Lv {effectiveLevel(prog)} · {prog.xp} XP
                  </Text>
                </View>
                <Text style={[styles.activeMark, isActive && { color: dragon.accent }]}>
                  {isActive ? '●' : '○'}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {toast ? (
          <Animated.Text entering={FadeIn} style={styles.toast}>
            {toast}
          </Animated.Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>YOUR DRAGONS</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}>
        {DRAGONS.map((dragon, i) => {
          const isActive = active === dragon.id;
          const prog = getDragonProgress(profile, dragon.id);
          const stage = stageForXpLevel(effectiveLevel(prog), dragon.id);
          return (
            <React.Fragment key={dragon.id}>
              {i > 0 ? <View style={styles.chipDivider} /> : null}
              <Pressable
                onPress={() => selectDragon(dragon.id)}
                disabled={locked}
                style={styles.chip}>
                <Image source={stage.art} style={styles.chipArt} />
                <View>
                  <Text style={[styles.chipName, isActive && { color: dragon.accent }]}>
                    {dragon.name}
                  </Text>
                  <Text style={styles.chipMeta}>
                    {busy === dragon.id ? 'Switching…' : stage.name}
                  </Text>
                </View>
              </Pressable>
            </React.Fragment>
          );
        })}
      </ScrollView>
      {toast ? (
        <Animated.Text entering={FadeIn} style={styles.toast}>
          {toast}
        </Animated.Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginBottom: spacing.md, marginTop: spacing.sm },
  label: { ...type.label },
  chipRow: { alignItems: 'center', paddingVertical: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 8,
    paddingHorizontal: 4,
    minHeight: 44,
  },
  chipDivider: {
    width: StyleSheet.hairlineWidth,
    height: 36,
    backgroundColor: colors.hairline,
    marginHorizontal: spacing.sm,
  },
  chipArt: { width: 36, height: 36 },
  chipName: { fontFamily: fonts.displayMedium, fontSize: 13, color: colors.text },
  chipMeta: { fontFamily: fonts.mono, fontSize: 9, color: colors.textTertiary, marginTop: 1 },
  cardList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 14,
    minHeight: 44,
  },
  cardRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  accentBar: {
    width: 2,
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
  },
  cardArt: { width: 48, height: 48 },
  cardName: { fontFamily: fonts.display, fontSize: 15, color: colors.text },
  cardMeta: { fontFamily: fonts.mono, fontSize: 10, color: colors.textSecondary, marginTop: 2 },
  activeMark: { fontFamily: fonts.mono, fontSize: 12, color: colors.textTertiary },
  toast: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.accentSecondary,
    letterSpacing: 0.5,
  },
});
