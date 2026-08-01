type FoodCatalogApi = typeof import('@/lib/food-catalog');

let loadPromise: Promise<FoodCatalogApi> | null = null;

/**
 * Start loading the heavy food-catalog bundle in the background.
 * Safe to call from pressIn / result-phase mount so Add ingredient
 * can paint its skeleton while this finishes.
 */
export function prefetchFoodCatalog(): Promise<FoodCatalogApi> {
  if (!loadPromise) {
    loadPromise = import('@/lib/food-catalog');
  }
  return loadPromise;
}
