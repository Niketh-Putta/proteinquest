import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ob } from './theme';

type Option = [string, string];

export function OptionList({
  options,
  value,
  onChange,
  long,
}: {
  options: Option[];
  value: string;
  onChange: (v: string) => void;
  long?: boolean;
}) {
  return (
    <View style={[styles.list, long && styles.long]}>
      {options.map(([label, sub]) => {
        const selected = label === value;
        return (
          <Pressable
            key={label}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(label)}
            style={[styles.option, selected && styles.selected]}>
            <View style={styles.icon}>
              <Ionicons
                name={selected ? 'radio-button-on' : 'ellipse-outline'}
                size={18}
                color={selected ? ob.accent : ob.muted2}
              />
            </View>
            <View style={styles.copy}>
              <Text style={styles.label}>{label}</Text>
              {sub ? <Text style={styles.sub}>{sub}</Text> : null}
            </View>
            <View style={[styles.radio, selected && styles.radioOn]}>
              {selected ? <View style={styles.radioDot} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 11, paddingVertical: 25 },
  long: { paddingTop: 24, gap: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    minHeight: 61,
    borderWidth: 1,
    borderColor: ob.border,
    backgroundColor: ob.card,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 17,
  },
  selected: {
    borderWidth: 1.5,
    borderColor: ob.borderStrong,
    backgroundColor: ob.raised,
    paddingVertical: 13.5,
    paddingHorizontal: 16.5,
  },
  icon: {
    width: 26,
    height: 27,
    borderRadius: 7,
    backgroundColor: ob.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1 },
  label: {
    fontSize: 14,
    letterSpacing: -0.15,
    color: ob.inkSoft,
    fontWeight: '500',
  },
  sub: { fontSize: 10, color: ob.muted2, marginTop: 3 },
  radio: {
    width: 21,
    height: 21,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: ob.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { backgroundColor: ob.accent, borderColor: ob.accent },
  radioDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: ob.primaryText },
});
