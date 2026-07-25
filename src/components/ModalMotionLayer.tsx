import type { ReactNode } from 'react';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

const DURATION_MS = 180;

type Props = {
  visible: boolean;
  backdrop: ReactNode;
  cardStyle: StyleProp<ViewStyle>;
  children: ReactNode;
  onExited?: () => void;
  accessibilityViewIsModal?: boolean;
};

/** Keeps backdrop and card on one timing clock, without animating glass blur. */
export function ModalMotionLayer({
  visible,
  backdrop,
  cardStyle,
  children,
  onExited,
  accessibilityViewIsModal,
}: Props) {
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.stopAnimation();
    if (visible) {
      setMounted(true);
      const frame = requestAnimationFrame(() => {
        Animated.timing(progress, {
          toValue: 1,
          duration: DURATION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      });
      return () => cancelAnimationFrame(frame);
    }
    if (!mounted) return;
    Animated.timing(progress, {
      toValue: 0,
      duration: DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setMounted(false);
      onExited?.();
    });
  }, [mounted, onExited, progress, visible]);

  if (!mounted) return null;

  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
        {backdrop}
      </Animated.View>
      <Animated.View
        style={[
          cardStyle,
          {
            opacity: progress,
            transform: [
              {
                scale: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.96, 1],
                }),
              },
            ],
          },
        ]}
        accessibilityViewIsModal={accessibilityViewIsModal}>
        {children}
      </Animated.View>
    </>
  );
}
