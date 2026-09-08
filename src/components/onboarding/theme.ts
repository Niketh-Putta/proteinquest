import { colors } from '@/theme';

/**
 * Onboarding tokens mapped to ProteinQuest dark "ember dusk".
 * Same screen flow as the v21 prototype; colors match the live app.
 */
export const ob = {
  canvas: colors.bg,
  ink: colors.text,
  inkSoft: colors.text,
  muted: colors.textSecondary,
  muted2: colors.textTertiary,
  card: colors.surface,
  raised: colors.bgRaised,
  surface: colors.surface2,
  white: colors.surface2,
  border: colors.hairline,
  borderStrong: colors.accent,
  primary: colors.accent,
  primaryPressed: colors.accentPressed,
  primaryDisabled: colors.hairlineBright,
  primaryText: colors.onAccent,
  accent: colors.accent,
  accentSoft: colors.accentLight,
  accentSecondary: colors.accentSecondary,
  danger: colors.danger,
  track: colors.ringTrack,
  wheelHighlight: colors.surfaceElevated,
  comparison: colors.accentSecondary,
  chip: colors.accentSecondary,
  success: colors.success,
  handsetBorder: colors.hairlineBright,
  footerFade: colors.bg,
} as const;
