import { VideoView, useVideoPlayer } from 'expo-video';
import React, { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { ob } from './theme';

// Standard clip is committed; optional HQ: copy onboarding-demo-hq.mp4 and swap this require.
const DEMO_VIDEO = require('@/assets/video/onboarding-demo.mp4');

type Phase = 'enter' | 'play' | 'exit' | 'wait';

export function IntroPhone() {
  const { width } = useWindowDimensions();
  const handsetW = Math.min(200, Math.max(140, width * 0.42));
  const handsetH = handsetW * (1920 / 888);

  const [phase, setPhase] = useState<Phase>('enter');
  const [blocked, setBlocked] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reduced, setReduced] = useState(false);

  const player = useVideoPlayer(DEMO_VIDEO, (p) => {
    p.loop = false;
    p.muted = true;
  });

  const tx = useSharedValue(width);
  const ty = useSharedValue(95);
  const rot = useSharedValue(14);
  const opacity = useSharedValue(0);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (failed) return;

    if (reduced) {
      tx.value = 0;
      ty.value = 0;
      rot.value = 0;
      opacity.value = 1;
      setPhase('play');
      return;
    }

    if (phase === 'enter') {
      opacity.value = 1;
      tx.value = withTiming(0, { duration: 1200, easing: Easing.bezier(0.16, 1, 0.3, 1) });
      ty.value = withTiming(0, { duration: 1200, easing: Easing.bezier(0.05, 0.65, 0.2, 1) });
      rot.value = withTiming(0, { duration: 1200, easing: Easing.bezier(0.05, 0.65, 0.2, 1) }, () => {
        runOnJS(setPhase)('play');
      });
    } else if (phase === 'exit') {
      tx.value = withTiming(-width * 1.2, {
        duration: 1200,
        easing: Easing.bezier(0.7, 0, 0.84, 0),
      });
      ty.value = withTiming(95, { duration: 1200, easing: Easing.bezier(0.8, 0, 0.95, 0.35) });
      rot.value = withTiming(-14, { duration: 1200, easing: Easing.bezier(0.8, 0, 0.95, 0.35) }, () => {
        runOnJS(setPhase)('wait');
      });
    } else if (phase === 'wait') {
      const t = setTimeout(() => {
        tx.value = width;
        ty.value = 95;
        rot.value = 14;
        opacity.value = 0;
        try {
          player.currentTime = 0;
        } catch {
          // ignore
        }
        setPhase('enter');
      }, 350);
      return () => clearTimeout(t);
    }
  }, [phase, reduced, failed, width, player, tx, ty, rot, opacity]);

  useEffect(() => {
    if (phase !== 'play' || failed) return;
    try {
      player.play();
      setBlocked(false);
    } catch {
      setBlocked(true);
    }
  }, [phase, failed, player]);

  useEffect(() => {
    const sub = player.addListener('statusChange', ({ status, error }) => {
      if (status === 'error' || error) setFailed(true);
    });
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    const sub = player.addListener('playToEnd', () => {
      if (reduced) {
        try {
          player.currentTime = 0;
          player.pause();
        } catch {
          // ignore
        }
        setBlocked(true);
      } else {
        setPhase('exit');
      }
    });
    return () => sub.remove();
  }, [player, reduced]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        try {
          player.pause();
        } catch {
          // ignore
        }
      } else if (phase === 'play' && !blocked) {
        try {
          player.play();
        } catch {
          setBlocked(true);
        }
      }
    });
    return () => sub.remove();
  }, [player, phase, blocked]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { rotate: `${rot.value}deg` },
    ],
  }));

  return (
    <View style={styles.stage} accessibilityLabel="ProteinQuest app demonstration">
      <Animated.View
        style={[
          styles.handset,
          { width: handsetW, height: handsetH },
          reduced ? styles.reduced : animStyle,
        ]}>
        <View style={styles.island} />
        <View style={styles.display}>
          {!failed ? (
            <VideoView
              player={player}
              style={styles.video}
              contentFit="contain"
              nativeControls={false}
            />
          ) : null}
        </View>
      </Animated.View>
      {failed ? (
        <Text style={styles.control}>Video unavailable. You can still get started below.</Text>
      ) : blocked ? (
        <Pressable
          style={styles.controlBtn}
          onPress={() => {
            try {
              player.play();
              setBlocked(false);
              setPhase('play');
            } catch {
              setBlocked(true);
            }
          }}>
          <Text style={styles.control}>Play demo</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    flexGrow: 1,
    minHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginHorizontal: -8,
    paddingVertical: 8,
  },
  handset: {
    padding: 5,
    borderRadius: 26,
    backgroundColor: '#121214',
    borderWidth: 3,
    borderColor: '#d8d8db',
  },
  reduced: { opacity: 1, transform: [] },
  island: {
    position: 'absolute',
    zIndex: 2,
    top: 11,
    alignSelf: 'center',
    width: '27%',
    height: 12,
    borderRadius: 20,
    backgroundColor: '#080809',
    left: '36.5%',
  },
  display: {
    flex: 1,
    borderRadius: 21,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  video: { width: '100%', height: '100%' },
  control: { color: '#77737d', fontSize: 11, textAlign: 'center', marginTop: 8 },
  controlBtn: {
    position: 'absolute',
    bottom: 4,
    backgroundColor: ob.white,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
});
