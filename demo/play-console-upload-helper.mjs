/**
 * Play Console asset paths for upload (browser automation or manual).
 */
export const ASSETS = {
  icon: '/Users/nikethputta/proteinlens/store/icon-512.png',
  featureGraphic: '/Users/nikethputta/proteinlens/store/play-feature-graphic.png',
  aab: '/Users/nikethputta/proteinlens/store/proteinquest.aab',
  phoneScreenshots: [
    '/Users/nikethputta/proteinlens/store/screenshots/01-today.png',
    '/Users/nikethputta/proteinlens/store/screenshots/02-trends.png',
    '/Users/nikethputta/proteinlens/store/screenshots/03-intro.png',
    '/Users/nikethputta/proteinlens/store/screenshots/04-paywall.png',
    '/Users/nikethputta/proteinlens/store/screenshots/05-scan.png',
  ],
  listing: '/Users/nikethputta/proteinlens/store/play-store-listing.json',
  subscriptions: '/Users/nikethputta/proteinlens/store/google-play-subscriptions.json',
};

console.log(JSON.stringify(ASSETS, null, 2));
