/**
 * Warm heavy food-catalog chunks without blocking the current press handler.
 * Safe to call from idle / after navigation — NOT from onPressIn on Android.
 */
export function prefetchFoodCatalog(): void {
  void import('@/lib/food-catalog')
    .then((m) => m.prefetchHeavyFoodCatalogChunks())
    .catch(() => {});
}

/** Full warm (merge/sort/index) — only after interactions, never on press. */
export function warmFoodCatalogIdle(): void {
  void import('@/lib/food-catalog')
    .then(async (m) => {
      const { InteractionManager } = await import('react-native');
      await new Promise<void>((resolve) => {
        InteractionManager.runAfterInteractions(() => resolve());
      });
      await m.warmFoodCatalog();
    })
    .catch(() => {});
}
