/**
 * Cheap route-only hint. Do NOT load catalog chunks from here — that freezes
 * the whole Android UI while Hermes parses ~600KB of food modules.
 */
export function prefetchFoodCatalog(): void {
  // intentionally empty — kept for call-site compatibility
}

/** @deprecated Prefer loadHeavy only on the ingredient screen. */
export function warmFoodCatalogIdle(): void {
  // No-op: full catalog warm must never run in the background of the main app.
}
