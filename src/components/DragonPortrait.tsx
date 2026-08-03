import { Image } from 'expo-image';
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

import { microProgress } from '@/lib/character';
import type { DragonId } from '@/lib/types';
import { radius } from '@/theme';

interface Props {
  art: ImageSourcePropType;
  accent: string;
  level: number;
  dragonId: DragonId;
  size?: number;
  showGlow?: boolean;
  /** Prefer for intro / first-paint surfaces so the portrait is not blank while decoding. */
  priority?: 'low' | 'normal' | 'high';
}

export function DragonPortrait({
  art,
  accent,
  level,
  dragonId,
  size = 200,
  showGlow = true,
  priority = 'high',
}: Props) {
  const micro = microProgress(level, dragonId);
  const stretchComp = (micro.scaleY - 1) * (size * 0.15);

  return (
    <View style={[styles.stage, { width: size + 40, height: size + 40 }]}>
      {showGlow ? (
        <View
          style={[
            styles.glow,
            {
              width: size * 1.4,
              height: size * 1.4,
              borderRadius: size * 0.7,
              backgroundColor: accent,
              opacity: micro.glowOpacity,
            },
            Platform.OS === 'web' && styles.glowBlur,
          ]}
        />
      ) : null}
      <View
        style={{
          transform: [
            { translateY: micro.translateY - stretchComp },
            { scaleX: micro.scale },
            { scaleY: micro.scaleY },
          ],
        }}>
        <View style={[styles.frame, { borderColor: `${accent}50`, width: size, height: size }]}>
          <Image
            source={art}
            style={{ width: size, height: size, borderRadius: radius.character }}
            contentFit="cover"
            priority={priority}
            cachePolicy="memory-disk"
            transition={0}
            recyclingKey={`dragon-${dragonId}-${level}`}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute' },
  glowBlur: Platform.select({
    web: { filter: 'blur(48px)' as unknown as undefined },
    default: {},
  }),
  frame: {
    borderRadius: radius.character,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(18, 20, 28, 0.9)',
  },
});
