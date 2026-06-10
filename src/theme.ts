import { Platform } from 'react-native';

// "Obsidian instrument" — warm near-black, one lime signal color,
// hairline borders, oversized numerals. The gram count is the hero.
export const colors = {
  bg: '#0B0B0D',
  bgRaised: '#101013',
  surface: '#141417',
  surface2: '#1B1B20',
  hairline: '#232329',
  hairlineBright: '#2E2E36',
  text: '#F4F4F0',
  textSecondary: '#A0A0AA',
  textTertiary: '#5E5E68',
  accent: '#C8F052',
  accentPressed: '#A8D62E',
  accentDeep: '#5E7522',
  accentGlow: 'rgba(200, 240, 82, 0.16)',
  accentSurface: '#15170D',
  onAccent: '#0C0E05',
  danger: '#FF7A6B',
  warning: '#FFB454',
  flame: '#FF9F45',
  ringTrack: '#1C1C21',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 12,
  md: 18,
  lg: 26,
  xl: 34,
  full: 999,
} as const;

// Sora: geometric, confident display face. JetBrains Mono: instrument labels.
export const fonts = {
  display: 'Sora_700Bold',
  displayHeavy: 'Sora_800ExtraBold',
  displayMedium: 'Sora_600SemiBold',
  mono: 'JetBrainsMono_500Medium',
  monoBold: 'JetBrainsMono_700Bold',
  body: Platform.select({ ios: 'system-ui', default: 'sans-serif' })!,
} as const;

export const type = {
  hero: { fontFamily: fonts.displayHeavy, fontSize: 72, lineHeight: 76, color: colors.text },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, color: colors.text },
  heading: { fontFamily: fonts.display, fontSize: 19, lineHeight: 25, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textSecondary },
  label: {
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.6,
    textTransform: 'uppercase' as const,
    color: colors.textTertiary,
  },
  stat: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, color: colors.text },
} as const;

export const shadowAccent = {
  shadowColor: colors.accent,
  shadowOpacity: 0.35,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 6 },
  elevation: 12,
} as const;
