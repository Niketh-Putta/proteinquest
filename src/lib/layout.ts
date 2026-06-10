import { useWindowDimensions } from 'react-native';

/** iPhone-first layout helpers — primary target 375–428px. */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const isNarrow = width < 400;
  const contentWidth = Math.min(width, 428);
  const horizontalPad = width < 380 ? 16 : 20;
  const ringSize = isNarrow ? Math.min(width - 48, 220) : Math.min(width - 64, 264);
  const touchMin = 44;

  return {
    width,
    height,
    isNarrow,
    contentWidth,
    horizontalPad,
    ringSize,
    touchMin,
  };
}
