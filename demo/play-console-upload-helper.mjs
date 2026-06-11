/**
 * Helper to upload Play Console assets via CDP when run against connected browser.
 * Primary automation uses cursor-ide-browser MCP; this documents file paths.
 */
export const ASSETS = {
  icon: '/Users/nikethputta/proteinlens/store/icon-512.png',
  featureGraphic: '/Users/nikethputta/proteinlens/store/play-feature-graphic.png',
  phoneScreenshots: [
    '/Users/nikethputta/proteinlens/store/screenshots/01-today.png',
    '/Users/nikethputta/proteinlens/store/screenshots/02-trends.png',
    '/Users/nikethputta/proteinlens/store/screenshots/03-intro.png',
  ],
};

console.log(JSON.stringify(ASSETS, null, 2));
