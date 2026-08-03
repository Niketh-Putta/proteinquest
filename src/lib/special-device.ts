import { useWindowDimensions } from 'react-native';

/**
 * Detect fold / flip / split / cover windows without changing normal phone layout.
 *
 * Normal portrait phones (incl. SE ~667h) must leave `isSpecial === false`
 * so existing responsive code paths stay bit-identical.
 */
export type SpecialDeviceLayout = {
  /** True only for non-standard windows — never for a normal full-screen phone. */
  isSpecial: boolean;
  /** Outer flip cover / extremely small pane. */
  isUltraCompact: boolean;
  /** Split-screen or fold tabletop half (short height, phone-ish width). */
  isSquatWindow: boolean;
  /** Unfolded fold / near-square large inner display. */
  isWideFoldLike: boolean;
  /**
   * Multiply chrome spacing/sizing when special.
   * Always `1` on normal phones so callers can `value * specialScale` safely.
   */
  specialScale: number;
  /** Extra bottom clearance shrink for squat panes (0 on normal phones). */
  specialGapCut: number;
};

export function getSpecialDeviceLayout(width: number, height: number): SpecialDeviceLayout {
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  const aspect = longSide / Math.max(shortSide, 1);

  // Cover screens / tiny multi-window panes (never a normal phone).
  const isUltraCompact = shortSide < 300 || height < 400;

  // Split / tabletop: short window. Floor stays under SE (~667) and most phones (~640+).
  const isSquatWindow =
    !isUltraCompact &&
    (height < 500 || (width < 600 && height < 560 && height / Math.max(width, 1) < 1.35));

  // Inner fold displays are wide and relatively square vs typical tablets (~1.4+).
  const isWideFoldLike = width >= 600 && aspect < 1.3;

  const isSpecial = isUltraCompact || isSquatWindow || isWideFoldLike;

  let specialScale = 1;
  let specialGapCut = 0;
  if (isUltraCompact) {
    specialScale = 0.72;
    specialGapCut = 10;
  } else if (isSquatWindow) {
    specialScale = 0.82;
    specialGapCut = 6;
  } else if (isWideFoldLike) {
    // Mild tighten — tablet path already handles width; just reduce wasted vertical chrome.
    specialScale = 0.92;
    specialGapCut = 4;
  }

  return {
    isSpecial,
    isUltraCompact,
    isSquatWindow,
    isWideFoldLike,
    specialScale,
    specialGapCut,
  };
}

export function useSpecialDeviceLayout(): SpecialDeviceLayout {
  const { width, height } = useWindowDimensions();
  return getSpecialDeviceLayout(width, height);
}
