import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { DRAGONS } from '@/lib/character';
import type { DragonId } from '@/lib/types';
import { colors, fonts, radius, spacing, type } from '@/theme';

interface Props {
  value: DragonId | null;
  onChange: (id: DragonId) => void;
}

export function DragonPicker({ value, onChange }: Props) {
  const [selected, setSelected] = useState<DragonId | null>(value);

  function pick(id: DragonId) {
    setSelected(id);
    onChange(id);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.kicker}>CHOOSE YOUR DRAGON</Text>
      <Text style={styles.title}>Reach your potential.</Text>
      <Text style={styles.sub}>
        Pick a companion to grow with. Each dragon has its own evolution path — protein
        feeds them.
      </Text>

      <View style={styles.grid}>
        {DRAGONS.map((dragon, i) => {
          const active = selected === dragon.id;
          return (
            <Animated.View
              key={dragon.id}
              entering={FadeInDown.delay(i * 80).springify().damping(16)}
              style={{ width: '100%' }}>
              <Pressable
                onPress={() => pick(dragon.id)}
                style={[
                  styles.card,
                  active && { borderColor: dragon.accent, backgroundColor: colors.accentSurface },
                ]}>
                <Image source={dragon.previewArt} style={styles.art} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, active && { color: dragon.accent }]}>
                    {dragon.name}
                  </Text>
                  <Text style={styles.titleSmall}>{dragon.title}</Text>
                  <Text style={styles.motto}>{dragon.motto}</Text>
                </View>
                <View
                  style={[
                    styles.radio,
                    active && { borderColor: dragon.accent, backgroundColor: dragon.accent },
                  ]}>
                  {active ? <View style={styles.radioInner} /> : null}
                </View>
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  kicker: { ...type.label, color: colors.accent },
  title: { fontFamily: fonts.displayHeavy, fontSize: 28, lineHeight: 34, color: colors.text },
  sub: { ...type.body, fontSize: 14, marginBottom: spacing.sm },
  grid: { gap: spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    padding: spacing.md,
    minHeight: 44,
  },
  art: { width: 72, height: 72, borderRadius: radius.md },
  name: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  titleSmall: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, color: colors.textTertiary },
  motto: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textSecondary, marginTop: 4 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.hairlineBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.onAccent },
});
