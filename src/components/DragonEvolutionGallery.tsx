import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DRAGONS } from '@/lib/character';
import { colors, fonts, radius, spacing } from '@/theme';

export function DragonEvolutionGallery() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>EVOLUTION FORMS</Text>
      <Text style={styles.sub}>
        Hit your daily protein goal to earn XP and level up. Five visual forms unlock at levels
        1, 5, 12, 20, and 40 - Ember, Frost, and Moss each progress separately.
      </Text>

      {DRAGONS.map((dragon) => (
        <View key={dragon.id} style={styles.dragonBlock}>
          <Text style={[styles.dragonName, { color: dragon.accent }]}>
            {dragon.name} · {dragon.title}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}>
            {dragon.stages.map((stage) => (
              <View key={stage.index} style={styles.stageCard}>
                <Image source={stage.art} style={styles.art} />
                <Text style={styles.stageLabel}>Stage {stage.index + 1}</Text>
                <Text style={[styles.stageName, { color: dragon.accent }]}>{stage.name}</Text>
                <Text style={styles.goals}>
                  {stage.levelRequired === 1 ? 'Start' : `Lv ${stage.levelRequired}`}
                </Text>
                <Text style={styles.perk}>{stage.perk}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairlineBright,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  heading: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 2.5,
    color: colors.textSecondary,
  },
  sub: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  dragonBlock: { gap: spacing.sm },
  dragonName: {
    fontFamily: fonts.displayMedium,
    fontSize: 15,
  },
  row: { gap: spacing.sm, paddingRight: spacing.md },
  stageCard: {
    width: 120,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    padding: spacing.sm,
    gap: 4,
  },
  art: { width: 88, height: 88 },
  stageLabel: {
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 1,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  stageName: {
    fontFamily: fonts.displayMedium,
    fontSize: 12,
  },
  goals: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.textTertiary,
  },
  perk: {
    fontFamily: fonts.body,
    fontSize: 9,
    color: colors.textTertiary,
    textAlign: 'center',
    lineHeight: 12,
  },
});
