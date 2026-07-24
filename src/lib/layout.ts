import { Platform, useWindowDimensions, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing } from '@/theme';

/** Fill tab scene height; overflow hidden on web so nested lists scroll. */
export const flexFill: ViewStyle =
  Platform.OS === 'web'
    ? { flex: 1, minHeight: 0, overflow: 'hidden' }
    : { flex: 1, minHeight: 0 };

/** FlatList / ScrollView body inside a flexFill parent. */
export const flexScroll: ViewStyle = { flex: 1, minHeight: 0 };

export type Breakpoint = 'phone' | 'tablet' | 'desktop';
export type HeroLayout = 'stack' | 'split' | 'sidebar';

/** ScanTabBar body above home-indicator padding (see (tabs)/_layout.tsx). */
const TAB_BAR_CHROME = 66;
const TAB_BAR_CHROME_COMPACT = 60;

/** Modest gap for footers pinned at the bottom of tab screen content (above the tab bar). */
export function usePinnedFooterGap(isCompact?: boolean) {
  const { height } = useWindowDimensions();
  const compact = isCompact ?? height < 700;
  return compact ? spacing.sm : spacing.md;
}

/** Bottom inset for scroll content on tab screens (clears tab bar + scan button). */
export function useTabBarScrollInset(isCompact?: boolean) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const compact = isCompact ?? height < 700;
  const chrome = compact ? TAB_BAR_CHROME_COMPACT : TAB_BAR_CHROME;
  const safeBottom = Math.max(insets.bottom, 12);
  const gap = compact ? spacing.sm : spacing.md;
  return chrome + safeBottom + gap;
}

/** Responsive layout - phone-first, scales up for tablet and desktop. */
export function useLayout() {
  const { width, height } = useWindowDimensions();

  const breakpoint: Breakpoint =
    width >= 1024 ? 'desktop' : width >= 600 ? 'tablet' : 'phone';

  const isPhone = breakpoint === 'phone';
  const isTablet = breakpoint === 'tablet';
  const isDesktop = breakpoint === 'desktop';
  const isWide = width >= 600;
  const isVeryNarrow = width < 340;
  const isNarrow = width < 400;
  /** Short viewports (SE / landscape phone) need tighter chrome. */
  const isTinyH = height < 620;
  const isCompactH = !isTinyH && height < 740;

  /** Wide shell for split/sidebar heroes (Today). */
  const contentMaxWidth = isDesktop ? 1100 : isTablet ? 760 : 480;
  /** Single-column forms/lists stay phone-like on tablet/iPad. */
  const formMaxWidth = isDesktop ? 560 : isTablet ? 520 : 480;
  const contentWidth = Math.min(width, contentMaxWidth);
  const formWidth = Math.min(width, formMaxWidth);
  const horizontalPad = isVeryNarrow ? 12 : width < 380 ? 16 : isDesktop ? 40 : isTablet ? 28 : 20;
  const touchMin = 44;

  const ringSize = isDesktop
    ? 360
    : isTablet
      ? Math.min(320, width - 160)
      : Math.min(width - 48, width < 400 ? 220 : 264);

  /** stack = phone column · split = tablet ring+dragon row · sidebar = desktop logs | dragon */
  const heroLayout: HeroLayout = isDesktop ? 'sidebar' : isTablet ? 'split' : 'stack';

  const columnGap = isDesktop ? 40 : isTablet ? 28 : 0;
  const asideWidth = isDesktop ? 400 : 0;

  const typeScale = isDesktop ? 1.2 : isTablet ? 1.08 : 1;
  const titleSize = Math.round(38 * typeScale);
  const characterScale = isDesktop ? 1.28 : isTablet ? 1.1 : 1;

  return {
    width,
    height,
    breakpoint,
    isPhone,
    isTablet,
    isDesktop,
    isWide,
    isNarrow,
    isVeryNarrow,
    isTinyH,
    isCompactH,
    contentWidth,
    contentMaxWidth,
    formWidth,
    formMaxWidth,
    horizontalPad,
    ringSize,
    touchMin,
    heroLayout,
    columnGap,
    asideWidth,
    typeScale,
    titleSize,
    characterScale,
    columns: isWide ? 2 : 1,
  };
}
