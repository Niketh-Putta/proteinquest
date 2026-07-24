import React from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useLayout } from '@/lib/layout';
import { colors, fonts, noTextCaret, pressableWeb, radius, spacing, textInputWeb, type } from '@/theme';

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
  onFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'email-address';
  autoComplete?: 'email' | 'password' | 'password-new' | 'off';
  onFocus?: () => void;
}) {
  return (
    <View style={styles.textFieldWrap}>
      <TextInput
        style={[styles.textField, textInputWeb]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        autoComplete={autoComplete}
        autoCorrect={false}
        onFocus={onFocus}
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
  keyboardType,
  onFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  suffix?: string;
  compact?: boolean;
  /** Prefer number-pad for integers, decimal-pad when decimals are allowed. */
  keyboardType?: KeyboardTypeOptions;
  onFocus?: () => void;
}) {
  const { isNarrow } = useLayout();
  const small = compact ?? isNarrow;
  const resolvedKeyboard: KeyboardTypeOptions =
    keyboardType ?? (Platform.OS === 'ios' ? 'decimal-pad' : 'numeric');

  return (
    <View style={[styles.inputWrap, { minWidth: 0 }]}>
      <TextInput
        style={[styles.input, small && styles.inputCompact, textInputWeb]}
        value={value}
        onChangeText={(t) =>
          onChange(
            resolvedKeyboard === 'number-pad'
              ? t.replace(/[^0-9]/g, '')
              : t.replace(/[^0-9.]/g, ''),
          )
        }
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        keyboardType={resolvedKeyboard}
        maxLength={5}
        onFocus={onFocus}
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
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={({ pressed }) => [
              styles.choice,
              pressableWeb,
              selected && styles.choiceSelected,
              pressed && styles.choicePressed,
              Platform.OS === 'web' ? webGlassBlur : null,
            ]}>
            <View pointerEvents="none" style={styles.choiceSheen} />
            <View style={[styles.choiceAccent, selected && styles.choiceAccentOn]} />
            <View style={styles.choiceBody}>
              <Text
                selectable={false}
                style={[styles.choiceTitle, selected && { color: colors.accentLight }]}
                numberOfLines={2}>
                {opt.title}
              </Text>
              {opt.subtitle ? (
                <Text selectable={false} style={styles.choiceSubtitle} numberOfLines={2}>
                  {opt.subtitle}
                </Text>
              ) : null}
            </View>
            <Text
              selectable={false}
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
    <View
      style={[
        styles.segmentWrap,
        { minWidth: 0 },
        Platform.OS === 'web' ? webGlassBlur : null,
      ]}>
      <View pointerEvents="none" style={styles.segmentSheen} />
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={({ pressed }) => [
              styles.segment,
              pressableWeb,
              selected && styles.segmentSelected,
              pressed && !selected && { opacity: 0.85 },
            ]}>
            <Text
              selectable={false}
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

const webGlassBlur: StyleProp<ViewStyle> =
  Platform.OS === 'web'
    ? ({
        backdropFilter: 'blur(16px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.3)',
      } as ViewStyle)
    : null;

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
    gap: spacing.sm,
    width: '100%',
    maxWidth: '100%',
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
    width: '100%',
    maxWidth: '100%',
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  choiceSelected: {
    backgroundColor: 'rgba(255,122,89,0.10)',
    borderColor: 'rgba(255,122,89,0.38)',
  },
  choicePressed: { opacity: 0.9 },
  choiceSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  choiceAccent: {
    width: 2,
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
    flexShrink: 0,
    borderRadius: 1,
  },
  choiceAccentOn: { backgroundColor: colors.accent },
  choiceBody: { flex: 1, minWidth: 0 },
  choiceTitle: { ...noTextCaret, fontFamily: fonts.displayMedium, fontSize: 15, color: colors.text },
  choiceSubtitle: {
    ...noTextCaret,
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.textSecondary,
    marginTop: 2,
  },
  choiceMark: {
    ...noTextCaret,
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
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 3,
    gap: 3,
  },
  segmentSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  segment: {
    flex: 1,
    minWidth: 0,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.chip,
    paddingHorizontal: 4,
  },
  segmentSelected: {
    backgroundColor: 'rgba(255,122,89,0.18)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,122,89,0.42)',
  },
  segmentLabel: {
    ...noTextCaret,
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
  segmentLabelOn: { color: colors.accentLight, fontFamily: fonts.monoBold },
});
