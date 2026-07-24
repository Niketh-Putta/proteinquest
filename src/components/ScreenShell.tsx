import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';

import { useLayout } from '@/lib/layout';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  /** When true, children can use a two-column row on tablet/desktop. */
  wide?: boolean;
  /** Phone-width column on tablet/iPad (forms, settings, lists). */
  form?: boolean;
}

export function ScreenShell({ children, style, wide, form }: Props) {
  const { contentMaxWidth, formMaxWidth, horizontalPad, isWide, columnGap } = useLayout();
  const maxWidth = form ? formMaxWidth : contentMaxWidth;

  return (
    <View
      style={[
        styles.shell,
        {
          paddingHorizontal: horizontalPad,
          maxWidth,
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
