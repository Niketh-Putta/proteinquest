import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { contentColumnStyle, useLayout, type ContentColumnMode } from '@/lib/layout';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** When true, children can use a two-column row on tablet/desktop. */
  wide?: boolean;
  /** Phone-width column on tablet/iPad (forms, settings, lists). Default true. */
  form?: boolean;
  /** Override mode: form (default) or wide hero layouts. */
  mode?: ContentColumnMode;
}

/**
 * Centered content column with responsive gutters + max width.
 * Use inside SafeAreaView / PageCanvas; does not own safe areas itself.
 */
export function ScreenShell({ children, style, wide, form = true, mode }: Props) {
  const { contentMaxWidth, formMaxWidth, horizontalPad, isWide, columnGap } = useLayout();
  const resolvedMode: ContentColumnMode = mode ?? (form === false || wide ? 'wide' : 'form');
  const maxWidth = resolvedMode === 'wide' ? contentMaxWidth : formMaxWidth;

  return (
    <View
      style={[
        styles.shell,
        contentColumnStyle({ horizontalPad, maxWidth }),
        wide && isWide && { gap: columnGap },
        style,
      ]}>
      <View style={styles.inner}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexGrow: 1,
    width: '100%',
  },
  inner: {
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'center',
  },
});
