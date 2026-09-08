import React, { useEffect, useRef } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ob } from './theme';

const ROW = 44;

export function WheelPicker({
  items,
  value,
  onChange,
  label,
  flex = 1,
}: {
  items: { value: number; label: string }[];
  value: number;
  onChange: (v: number) => void;
  label: string;
  flex?: number;
}) {
  const ref = useRef<ScrollView>(null);
  const scrolling = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (scrolling.current) return;
    const index = Math.max(0, items.findIndex((i) => i.value === value));
    ref.current?.scrollTo({ y: index * ROW, animated: false });
  }, [value, items]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function onScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = Math.min(
      items.length - 1,
      Math.max(0, Math.round(e.nativeEvent.contentOffset.y / ROW)),
    );
    scrolling.current = false;
    const next = items[index]?.value;
    if (next != null && next !== value) onChange(next);
  }

  return (
    <View style={[styles.wrap, { flex }]} accessibilityLabel={label}>
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ROW}
        decelerationRate="fast"
        onScrollBeginDrag={() => {
          scrolling.current = true;
        }}
        onMomentumScrollEnd={onScrollEnd}
        onScrollEndDrag={(e) => {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => onScrollEnd(e), 80);
        }}
        contentContainerStyle={styles.content}>
        <View style={styles.spacer} />
        {items.map((item) => (
          <View key={item.value} style={styles.row}>
            <Text style={[styles.text, item.value === value && styles.active]}>{item.label}</Text>
          </View>
        ))}
        <View style={styles.spacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 220 },
  content: { paddingHorizontal: 4 },
  spacer: { height: 88 },
  row: { height: ROW, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 18, color: ob.muted2 },
  active: { color: ob.ink, fontWeight: '600' },
});
