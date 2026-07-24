import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePinnedFooterGap, useTabBarScrollInset } from '@/lib/layout';
import { colors, spacing } from '@/theme';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Extra bottom clearance for the floating tab/scan chrome. */
  tabScreen?: boolean;
  /** Skip the top hairline (e.g. full-bleed CTAs). */
  borderless?: boolean;
  /** Force compact padding on short viewports. */
  compact?: boolean;
}

/**
 * Pinned CTA strip with consistent safe-area / tab-bar padding.
 * Pair with scroll paddingBottom ≈ layout.controlHeight + spacing.lg above.
 */
export function StickyFooter({
  children,
  style,
  tabScreen = false,
  borderless = false,
  compact,
}: Props) {
  const insets = useSafeAreaInsets();
  const footerGap = usePinnedFooterGap(compact);
  const tabInset = useTabBarScrollInset(compact);
  const paddingBottom = tabScreen
    ? tabInset
    : Math.max(insets.bottom, 12) + footerGap;

  return (
    <View
      style={[
        styles.footer,
        !borderless && styles.bordered,
        { paddingBottom },
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    paddingTop: spacing.md,
    backgroundColor: colors.bg,
  },
  bordered: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
});
