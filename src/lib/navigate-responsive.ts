import { InteractionManager } from 'react-native';
import { router, type Href } from 'expo-router';

/**
 * Run work after the navigation transition has started painting.
 * Use for keyboard dismiss, haptics, and heavy warmups that must not block the tap.
 */
export function runAfterNav(fn: () => void): void {
  requestAnimationFrame(() => {
    InteractionManager.runAfterInteractions(() => {
      try {
        fn();
      } catch {
        // ignore
      }
    });
  });
}

/** Push immediately, then optionally run deferred work. */
export function pushThen(href: Href, after?: () => void): void {
  router.push(href as never);
  if (after) runAfterNav(after);
}

/** Replace immediately, then optionally run deferred work. */
export function replaceThen(href: Href, after?: () => void): void {
  router.replace(href as never);
  if (after) runAfterNav(after);
}

/**
 * Best-effort warm of a route module so the first push does not wait on JS parse.
 * Expo Router has no stable prefetch API here; dynamic import is enough.
 */
export function prefetchRoute(routeModule: () => Promise<unknown>): void {
  void routeModule().catch(() => {});
}
