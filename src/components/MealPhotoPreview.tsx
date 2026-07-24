import { Image } from 'expo-image';
import React, { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View, useWindowDimensions } from 'react-native';

import { colors } from '@/theme';

interface Props {
  uri: string;
  /** Cap height as a fraction of screen height (default 0.42). */
  maxHeightRatio?: number;
  bordered?: boolean;
  /** Force a 1:1 square frame (meal scan photos). */
  square?: boolean;
  borderRadius?: number;
}

export function MealPhotoPreview({
  uri,
  maxHeightRatio = 0.42,
  bordered = true,
  square = false,
  borderRadius,
}: Props) {
  const { height: screenH } = useWindowDimensions();
  const maxHeight = screenH * maxHeightRatio;
  const [layoutWidth, setLayoutWidth] = useState(0);
  const [aspect, setAspect] = useState(3 / 4);

  const frameAspect = square ? 1 : aspect;
  const frameHeight =
    layoutWidth > 0
      ? square
        ? layoutWidth
        : Math.min(layoutWidth / frameAspect, maxHeight)
      : maxHeight;

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
        borderRadius != null && { borderRadius },
        // Always set height so expo-image is not 0×0 (Safari shows "Load Error").
        { height: frameHeight },
      ]}>
      <Image
        source={{ uri }}
        style={styles.image}
        contentFit={square ? 'cover' : 'contain'}
        cachePolicy="memory-disk"
        priority="high"
        recyclingKey={uri.slice(0, 64)}
        accessibilityLabel=""
        onLoad={(e) => {
          if (square) return;
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
