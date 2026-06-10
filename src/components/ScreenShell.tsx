import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';

import { useLayout } from '@/lib/layout';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  /** When true, children can use a two-column row on tablet/desktop. */
  wide?: boolean;
}

export function ScreenShell({ children, style, wide }: Props) {
  const { contentMaxWidth, horizontalPad, isWide, columnGap } = useLayout();

  return (
    <View
      style={[
        styles.shell,
        {
          paddingHorizontal: horizontalPad,
          maxWidth: contentMaxWidth,
          width: '100%',
          alignSelf: 'center',
        },
        wide && isWide && { gap: columnGap },
        style,
      ]}>
      <View style={[styles.inner, { maxWidth: '100%' }]}>
        {children}
      </View>
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
    alignSelf: 'center',
  },
});
