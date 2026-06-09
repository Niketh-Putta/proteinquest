import { Platform } from 'react-native';

export const colors = {
  bg: '#0A0A0B',
  card: '#141416',
  cardPressed: '#1C1C1F',
  border: '#26262A',
  text: '#F4F4F5',
  textSecondary: '#A1A1AA',
  textTertiary: '#5C5C66',
  accent: '#A3E635',
  accentDark: '#65A30D',
  accentText: '#0A0A0B',
  danger: '#F87171',
  warning: '#FBBF24',
  ringTrack: '#1F1F23',
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
  sm: 10,
  md: 16,
  lg: 24,
  full: 999,
} as const;

export const fonts = Platform.select({
  ios: { sans: 'system-ui', rounded: 'ui-rounded', mono: 'ui-monospace' },
  web: {
    sans: 'system-ui, -apple-system, sans-serif',
    rounded: 'ui-rounded, system-ui, -apple-system, sans-serif',
    mono: 'ui-monospace, monospace',
  },
  default: { sans: 'sans-serif', rounded: 'sans-serif-medium', mono: 'monospace' },
});
