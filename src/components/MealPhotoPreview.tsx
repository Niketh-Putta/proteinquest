import { Image } from 'expo-image';
import React, { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View, useWindowDimensions } from 'react-native';

import { colors } from '@/theme';

interface Props {
  uri: string;
  /** Cap height as a fraction of screen height (default 0.42). */
  maxHeightRatio?: number;
  bordered?: boolean;
}

export function MealPhotoPreview({ uri, maxHeightRatio = 0.42, bordered = true }: Props) {
  const { height: screenH } = useWindowDimensions();
  const maxHeight = screenH * maxHeightRatio;
  const [layoutWidth, setLayoutWidth] = useState(0);
  const [aspect, setAspect] = useState(3 / 4);

  const frameHeight =
    layoutWidth > 0 ? Math.min(layoutWidth / aspect, maxHeight) : maxHeight;

  function onLayout(e: LayoutChangeEvent) {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== layoutWidth) setLayoutWidth(w);
  }

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.frame,
        bordered && styles.bordered,
        layoutWidth > 0 && { height: frameHeight },
      ]}>
      <Image
        source={{ uri }}
        style={styles.image}
        contentFit="contain"
        onLoad={(e) => {
          const { width, height } = e.source;
          if (width && height && height > 0) setAspect(width / height);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  bordered: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineBright,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
