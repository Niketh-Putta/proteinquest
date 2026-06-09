import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors, radius, spacing } from '@/theme';

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function NumberField({
  value,
  onChange,
  placeholder,
  suffix,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  suffix?: string;
}) {
  return (
    <View style={styles.inputWrap}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^0-9.]/g, ''))}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        keyboardType="numeric"
        maxLength={5}
      />
      {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
    </View>
  );
}

export function ChoiceRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; title: string; subtitle?: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[styles.choice, selected && styles.choiceSelected]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.choiceTitle, selected && { color: colors.accent }]}>
                {opt.title}
              </Text>
              {opt.subtitle ? (
                <Text style={styles.choiceSubtitle}>{opt.subtitle}</Text>
              ) : null}
            </View>
            <View style={[styles.radio, selected && styles.radioSelected]} />
          </Pressable>
        );
      })}
    </View>
  );
}

export function SegmentedRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; title: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmentWrap}>
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[styles.segment, selected && styles.segmentSelected]}>
            <Text
              style={[
                styles.segmentLabel,
                selected && { color: colors.accentText },
              ]}>
              {opt.title}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    height: 56,
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  suffix: { fontSize: 16, color: colors.textTertiary, fontWeight: '600' },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  choiceSelected: { borderColor: colors.accent, backgroundColor: '#15180F' },
  choiceTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  choiceSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
  },
  radioSelected: { borderColor: colors.accent, backgroundColor: colors.accent },
  segmentWrap: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    height: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentSelected: { backgroundColor: colors.accent },
  segmentLabel: { fontSize: 15, fontWeight: '700', color: colors.textSecondary },
});
