import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ob } from './theme';

export function PaceSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const tier = value < 0.3 ? 0 : value <= 0.6 ? 1 : 2;
  const steps = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

  return (
    <View>
      <View style={styles.icons}>
        {[
          { icon: 'walk-outline' as const, label: 'Slow' },
          { icon: 'flash-outline' as const, label: 'Recommended' },
          { icon: 'rocket-outline' as const, label: 'Fast' },
        ].map((item, i) => (
          <View key={item.label} style={styles.iconCol}>
            <Ionicons name={item.icon} size={30} color={tier === i ? ob.accent : ob.muted2} />
            <Text style={[styles.iconLabel, tier === i && { color: ob.accent }]}>{item.label}</Text>
          </View>
        ))}
      </View>
      <View style={styles.track}>
        {steps.map((s) => (
          <Pressable
            key={s}
            onPress={() => onChange(s)}
            style={[styles.step, Math.abs(s - value) < 0.05 && styles.stepOn]}
            accessibilityLabel={`${s} kg per week`}
          />
        ))}
      </View>
      <View style={styles.ends}>
        <Text style={styles.end}>0.1</Text>
        <Text style={styles.end}>1.0 kg</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  icons: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  iconCol: { alignItems: 'center', gap: 4, flex: 1 },
  iconLabel: { fontSize: 11, color: ob.muted },
  track: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 36,
    backgroundColor: ob.track,
    borderRadius: 18,
    paddingHorizontal: 10,
  },
  step: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: ob.border,
  },
  stepOn: {
    backgroundColor: ob.accent,
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  ends: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  end: { fontSize: 11, color: ob.muted },
});
