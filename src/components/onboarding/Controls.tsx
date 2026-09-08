import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ob } from './theme';

export function UnitToggle({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.row}>
      {options.map((opt) => (
        <Pressable
          key={opt}
          onPress={() => onChange(opt)}
          style={[styles.btn, value === opt && styles.active]}>
          <Text style={[styles.text, value === opt && styles.textActive]}>{opt}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.primary,
        disabled && styles.primaryDisabled,
        pressed && !disabled && { backgroundColor: ob.primaryPressed },
      ]}>
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

export function TextButton({ label, onPress }: { label: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.textBtn}>
      {typeof label === 'string' ? <Text style={styles.textBtnLabel}>{label}</Text> : label}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: ob.track,
    borderRadius: 20,
    padding: 2,
    width: 195,
    marginTop: 24,
  },
  btn: {
    flex: 1,
    minHeight: 25,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  active: { backgroundColor: ob.surface },
  text: { fontSize: 12, color: ob.muted },
  textActive: { color: ob.ink, fontWeight: '600' },
  primary: {
    borderRadius: 99,
    backgroundColor: ob.primary,
    minHeight: 55,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  primaryDisabled: { backgroundColor: ob.primaryDisabled },
  primaryText: { color: ob.primaryText, fontSize: 14, fontWeight: '600' },
  textBtn: { minHeight: 46, paddingVertical: 13, alignItems: 'center' },
  textBtnLabel: { fontSize: 13, color: ob.muted },
});
