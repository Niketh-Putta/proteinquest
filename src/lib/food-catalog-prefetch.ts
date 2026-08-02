/**
 * Warm heavy food-catalog chunks without blocking the current press handler.
 * Safe to call from onPressIn / result-phase mount.
 */
export function prefetchFoodCatalog(): void {
  void import('@/lib/food-catalog')
    .then((m) => m.warmFoodCatalog())
    .catch(() => {});
}
