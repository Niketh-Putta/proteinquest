import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useLayout } from '@/lib/layout';
import { colors, fonts, spacing, type } from '@/theme';

export function FieldLabel({ children }: { children: React.ReactNode }) {
  const { isNarrow } = useLayout();
  return (
    <Text style={[styles.label, isNarrow && styles.labelNarrow]} numberOfLines={2}>
      {children}
    </Text>
  );
}

export function TextField({
  value,
  onChange,
  placeholder,
  secureTextEntry,
  autoCapitalize = 'none',
  keyboardType = 'default',
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'email-address';
  autoComplete?: 'email' | 'password' | 'password-new' | 'off';
}) {
  return (
    <View style={styles.textFieldWrap}>
      <TextInput
        style={styles.textField}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        autoComplete={autoComplete}
        autoCorrect={false}
      />
    </View>
  );
}

export function NumberField({
  value,
  onChange,
  placeholder,
  suffix,
  compact,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  suffix?: string;
  compact?: boolean;
}) {
  const { isNarrow } = useLayout();
  const small = compact ?? isNarrow;

  return (
    <View style={[styles.inputWrap, { minWidth: 0 }]}>
      <TextInput
        style={[styles.input, small && styles.inputCompact]}
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^0-9.]/g, ''))}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        keyboardType="numeric"
        maxLength={5}
      />
      {suffix ? (
        <Text style={[styles.suffix, small && styles.suffixCompact]}>{suffix}</Text>
      ) : null}
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
  const { isNarrow } = useLayout();

  return (
    <View style={styles.choiceList}>
      {options.map((opt, i) => {
        const selected = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[styles.choice, i > 0 && styles.choiceBorder]}>
            <View style={[styles.choiceAccent, selected && styles.choiceAccentOn]} />
            <View style={styles.choiceBody}>
              <Text
                style={[styles.choiceTitle, selected && { color: colors.accent }]}
                numberOfLines={2}>
                {opt.title}
              </Text>
              {opt.subtitle ? (
                <Text style={styles.choiceSubtitle} numberOfLines={2}>
                  {opt.subtitle}
                </Text>
              ) : null}
            </View>
            <Text
              style={[
                styles.choiceMark,
                selected && { color: colors.accent },
                isNarrow && styles.choiceMarkNarrow,
              ]}>
              {selected ? '●' : '○'}
            </Text>
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
  compact,
}: {
  options: { value: T; title: string }[];
  value: T | null;
  onChange: (v: T) => void;
  compact?: boolean;
}) {
  const { isNarrow } = useLayout();
  const small = compact ?? isNarrow;

  return (
    <View style={[styles.segmentWrap, { minWidth: 0 }]}>
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
                selected && styles.segmentLabelOn,
                small && styles.segmentLabelCompact,
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}>
              {opt.title}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...type.label, marginBottom: spacing.sm, marginTop: spacing.lg },
  labelNarrow: { letterSpacing: 1, fontSize: 10 },
  textFieldWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairlineBright,
    marginBottom: spacing.md,
  },
  textField: {
    height: 48,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.text,
    padding: 0,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairlineBright,
    paddingBottom: 4,
    width: '100%',
    maxWidth: '100%',
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: 52,
    fontSize: 28,
    fontFamily: fonts.display,
    color: colors.text,
    padding: 0,
  },
  inputCompact: {
    height: 46,
    fontSize: 24,
  },
  suffix: {
    flexShrink: 0,
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.textTertiary,
    marginLeft: spacing.sm,
  },
  suffixCompact: {
    fontSize: 10,
    letterSpacing: 0.8,
  },
  choiceList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    width: '100%',
    maxWidth: '100%',
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: spacing.md,
    width: '100%',
    maxWidth: '100%',
  },
  choiceBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  choiceAccent: {
    width: 2,
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
    flexShrink: 0,
  },
  choiceAccentOn: { backgroundColor: colors.accent },
  choiceBody: { flex: 1, minWidth: 0 },
  choiceTitle: { fontFamily: fonts.displayMedium, fontSize: 15, color: colors.text },
  choiceSubtitle: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.textSecondary,
    marginTop: 2,
  },
  choiceMark: {
    flexShrink: 0,
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.textTertiary,
  },
  choiceMarkNarrow: { fontSize: 11 },
  segmentWrap: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: '100%',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  segment: {
    flex: 1,
    minWidth: 0,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    paddingHorizontal: 4,
  },
  segmentSelected: { borderBottomColor: colors.accent },
  segmentLabel: {
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 0.8,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  segmentLabelCompact: {
    fontSize: 11,
    letterSpacing: 0.4,
  },
  segmentLabelOn: { color: colors.accent, fontFamily: fonts.monoBold },
});
