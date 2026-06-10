import React from 'react';
import { Platform, StyleSheet, View, ViewStyle } from 'react-native';

import { useLayout } from '@/lib/layout';
import { colors } from '@/theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
}

/** Full-bleed canvas with subtle raised side panels on wide desktop web. */
export function PageCanvas({ children, style }: Props) {
  const { isDesktop, width, contentMaxWidth } = useLayout();
  const showMargins = isDesktop && Platform.OS === 'web' && width > contentMaxWidth + 80;

  return (
    <View style={[styles.root, style]}>
      {showMargins ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={styles.marginRow}>
            <View style={styles.marginPanel} />
            <View style={{ width: contentMaxWidth }} />
            <View style={styles.marginPanel} />
          </View>
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  marginRow: { flex: 1, flexDirection: 'row' },
  marginPanel: {
    flex: 1,
    backgroundColor: colors.bgRaised,
    opacity: 0.55,
    borderColor: colors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
