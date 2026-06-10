import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing } from '@/theme';

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

  const contentMaxWidth = isDesktop ? 880 : isTablet ? 680 : 480;
  const contentWidth = Math.min(width, contentMaxWidth);
  const horizontalPad = width < 380 ? 16 : isDesktop ? 40 : isTablet ? 28 : 20;
  const touchMin = 44;

  const ringSize = isDesktop
    ? 320
    : isTablet
      ? Math.min(300, width - 160)
      : Math.min(width - 48, width < 400 ? 220 : 264);

  /** stack = phone column · split = tablet ring+dragon row · sidebar = desktop logs | dragon */
  const heroLayout: HeroLayout = isDesktop ? 'sidebar' : isTablet ? 'split' : 'stack';

  const columnGap = isDesktop ? 32 : isTablet ? 24 : 0;
  const asideWidth = isDesktop ? 360 : 0;

  const typeScale = isDesktop ? 1.15 : isTablet ? 1.05 : 1;
  const titleSize = Math.round(38 * typeScale);
  const characterScale = isDesktop ? 1.2 : isTablet ? 1.08 : 1;

  return {
    width,
    height,
    breakpoint,
    isPhone,
    isTablet,
    isDesktop,
    isWide,
    isNarrow: width < 400,
    contentWidth,
    contentMaxWidth,
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
