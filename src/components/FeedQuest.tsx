import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { trackEvent } from '@/lib/analytics';
import { CARE_STEP_XP, getCareSteps } from '@/lib/care-quests';
import { colors, fonts, pressableWeb, spacing } from '@/theme';

interface Props {
  dragonName: string;
  mealsToday: number;
  consumed: number;
  goal: number;
}

export function FeedQuest({ dragonName, mealsToday, consumed, goal }: Props) {
  const steps = getCareSteps({ dragonName, mealsToday, consumed, goal });
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>today’s care</Text>
        <Text style={styles.progress}>
          {doneCount}/{steps.length}
        </Text>
      </View>
      <View style={styles.steps}>
        {steps.map((s, i) => (
          <View key={s.id} style={styles.row}>
            <Ionicons
              name={s.done ? 'checkmark-circle' : 'ellipse-outline'}
              size={13}
              color={s.done ? colors.accent : colors.textTertiary}
            />
            <Text style={[styles.label, s.done && styles.labelDone]}>{s.label}</Text>
            <Text style={[styles.xp, s.done && styles.xpDone]}>+{CARE_STEP_XP[i]}xp</Text>
          </View>
        ))}
      </View>
      {!allDone ? (
        <Pressable
          onPress={() => {
            trackEvent('feed_cta_tapped', { source: 'quest' });
            router.push('/scan');
          }}
          style={({ pressed }) => [styles.cta, pressableWeb, pressed && { opacity: 0.85 }]}>
          <Ionicons name="restaurant" size={11} color={colors.onAccent} />
          <Text style={styles.ctaText}>Feed {dragonName}</Text>
        </Pressable>
      ) : (
        <Text style={styles.done}>{dragonName} is thriving today</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,122,89,0.2)',
    backgroundColor: 'rgba(255,122,89,0.05)',
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: fonts.monoBold,
    fontSize: 9,
    letterSpacing: 1.4,
    color: colors.textTertiary,
    textTransform: 'lowercase',
  },
  progress: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 0.6,
    color: colors.accent,
  },
  steps: { gap: 5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  label: {
    flex: 1,
    fontFamily: fonts.displayMedium,
    fontSize: 13,
    color: colors.text,
  },
  labelDone: { color: colors.textTertiary, textDecorationLine: 'line-through' },
  xp: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 0.4,
    color: colors.accent,
  },
  xpDone: { color: colors.textTertiary },
  cta: {
    marginTop: 2,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  ctaText: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 0.7,
    color: colors.onAccent,
    textTransform: 'uppercase',
  },
  done: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.accent,
    fontStyle: 'italic',
  },
});
