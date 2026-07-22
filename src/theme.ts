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
  /** Primary UI sans — Outfit at medium weights (premium, not heavy). */
  display: 'Outfit_500Medium',
  displayHeavy: 'Outfit_600SemiBold',
  displayMedium: 'Outfit_500Medium',
  mono: 'JetBrainsMono_500Medium',
  monoBold: 'JetBrainsMono_700Bold',
  body: 'Outfit_400Regular',
} as const;

/**
 * Display titles need a little air so ascenders never clip.
 * Use this for display titles and hero numbers instead of 1:1 leading.
 */
export function displayLH(fontSize: number): number {
  return Math.round(fontSize * 1.18);
}

export const type = {
  hero: {
    fontFamily: fonts.displayHeavy,
    fontSize: 72,
    lineHeight: displayLH(72),
    color: colors.text,
    ...(Platform.OS === 'android' ? { includeFontPadding: true } : null),
  },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: displayLH(28), color: colors.text },
  heading: { fontFamily: fonts.display, fontSize: 19, lineHeight: displayLH(19), color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textSecondary },
  label: {
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.6,
    textTransform: 'uppercase' as const,
    color: colors.textTertiary,
  },
  /** Screen titles (Today, League, etc.) — semi-bold with light tracking. */
  pageTitle: {
    fontFamily: fonts.displayHeavy,
    fontSize: 36,
    lineHeight: displayLH(36),
    letterSpacing: -0.6,
    color: colors.text,
    ...(Platform.OS === 'android' ? { includeFontPadding: true } : null),
  },
  /** Uppercase mono eyebrows (LAST 7 DAYS, PROTEIN TODAY). */
  eyebrow: {
    fontFamily: fonts.mono,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 3,
    color: colors.textTertiary,
  },
  stat: { fontFamily: fonts.display, fontSize: 24, lineHeight: displayLH(24), color: colors.text },
} as const;

// RN 0.76+ / react-native-web support boxShadow directly; shadow* props are deprecated on web.
export const shadowAccent: ViewStyle = {
  boxShadow: '0 6px 22px rgba(255, 122, 89, 0.32)',
  elevation: 12,
};

export const shadowCard: ViewStyle = {
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
  elevation: 8,
};

/** Label Text inside Pressables — no text selection; must NOT be used on TextInput. */
export const noTextCaret: TextStyle =
  Platform.OS === 'web'
    ? ({ userSelect: 'none', cursor: 'default', pointerEvents: 'none' } as unknown as TextStyle)
    : {};

/** Web styles for editable TextInput fields — clickable, typable, with a visible caret. */
export const textInputWeb: TextStyle =
  Platform.OS === 'web'
    ? ({
        outlineStyle: 'none',
        cursor: 'text',
        pointerEvents: 'auto',
        userSelect: 'text',
        caretColor: colors.accent,
      } as unknown as TextStyle)
    : {};

/** Tappable control chrome on web — pointer cursor, no focus ring. */
export const pressableWeb: ViewStyle =
  Platform.OS === 'web'
    ? ({ cursor: 'pointer', outlineWidth: 0 } as unknown as ViewStyle)
    : {};
