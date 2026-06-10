import { Platform, TextStyle, ViewStyle } from 'react-native';

// "Ember dusk" - deep charcoal, warm coral signal, violet undertones.
// Premium Locked-meets-CalAI; no lime green.
export const colors = {
  bg: '#0C0B10',
  bgRaised: '#12111A',
  surface: '#18171F',
  surface2: '#201F28',
  surfaceElevated: '#24232D',
  hairline: '#2A2835',
  hairlineBright: '#36344A',
  text: '#F6F4F8',
  textSecondary: '#A8A3B8',
  textTertiary: '#6B6578',
  accent: '#FF7A59',
  accentLight: '#FF9B82',
  accentPressed: '#E85F42',
  accentDeep: '#C44E35',
  accentGlow: 'rgba(255, 122, 89, 0.22)',
  accentSurface: '#1F1512',
  accentSecondary: '#9B8CFF',
  onAccent: '#FFF9F7',
  danger: '#FF6B7A',
  warning: '#FFB454',
  flame: '#FF9F5A',
  ringTrack: '#22202C',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/** Intentional variation - tighter chips, softer character frames, native buttons. */
export const radius = {
  chip: 8,
  button: 14,
  sm: 12,
  md: 18,
  character: 28,
  lg: 26,
  xl: 34,
  full: 999,
} as const;

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
  shadowOpacity: 0.32,
  shadowRadius: 22,
  shadowOffset: { width: 0, height: 6 },
  elevation: 12,
} as const;

export const shadowCard = {
  shadowColor: '#000',
  shadowOpacity: 0.35,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 4 },
  elevation: 8,
} as const;

/** Label Text inside Pressables — no web caret or text selection. */
export const noTextCaret: TextStyle =
  Platform.OS === 'web' ? ({ userSelect: 'none', cursor: 'default' } as TextStyle) : {};

/** Tappable control chrome on web — pointer cursor, no focus ring. */
export const pressableWeb: ViewStyle =
  Platform.OS === 'web'
    ? ({ cursor: 'pointer', outlineWidth: 0 } as unknown as ViewStyle)
    : {};
