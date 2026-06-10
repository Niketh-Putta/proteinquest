import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  DRAGONS,
  activeDragonId,
  getDragonProgress,
  stageForGoalsHit,
  switchActiveDragon,
} from '@/lib/character';
import { useSession } from '@/lib/session';
import type { DragonId, Profile } from '@/lib/types';
import { colors, fonts, radius, spacing, type } from '@/theme';

export function DragonRoster({ profile }: { profile: Profile }) {
  const { saveProfile } = useSession();
  const [busy, setBusy] = useState<DragonId | null>(null);
  const active = activeDragonId(profile);

  function confirmSwitch(id: DragonId) {
    if (id === active) return;
    const dragon = DRAGONS.find((d) => d.id === id)!;
    Alert.alert(
      `Switch to ${dragon.name}?`,
      'Each dragon has separate progress. Your current dragon keeps its XP and evolution — you can switch back anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Switch',
          onPress: async () => {
            setBusy(id);
            try {
              await saveProfile(switchActiveDragon(profile, id));
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>YOUR DRAGONS</Text>
      {DRAGONS.map((dragon) => {
        const prog = getDragonProgress(profile, dragon.id);
        const stage = stageForGoalsHit(prog.goals_hit, dragon.id);
        const isActive = active === dragon.id;
        return (
          <Pressable
            key={dragon.id}
            onPress={() => confirmSwitch(dragon.id)}
            style={[styles.row, isActive && { borderColor: dragon.accent }]}>
            <Image source={stage.art} style={styles.art} />
            <View style={{ flex: 1 }}>
              <View style={styles.nameRow}>
                <Text style={styles.name}>{dragon.name}</Text>
                {isActive ? (
                  <View style={[styles.activePill, { backgroundColor: dragon.accent }]}>
                    <Text style={styles.activeText}>ACTIVE</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.meta}>
                {stage.name} {'\u00B7'} {prog.xp} XP {'\u00B7'} {prog.goals_hit} goals
              </Text>
            </View>
            {busy === dragon.id ? (
              <Text style={styles.meta}>...</Text>
            ) : (
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginBottom: spacing.lg },
  label: { ...type.label },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 44,
  },
  art: { width: 52, height: 52, borderRadius: radius.sm },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { fontFamily: fonts.display, fontSize: 16, color: colors.text },
  activePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full },
  activeText: { fontFamily: fonts.monoBold, fontSize: 9, color: colors.onAccent, letterSpacing: 1 },
  meta: { fontFamily: fonts.mono, fontSize: 11, color: colors.textSecondary, marginTop: 2 },
});
