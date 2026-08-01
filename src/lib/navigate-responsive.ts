import { router, type Href } from 'expo-router';
import { InteractionManager } from 'react-native';

/** Prefetch a route so the next push paints immediately (iOS + Android). */
export function prefetchRoute(href: Href) {
  try {
    router.prefetch(href);
  } catch {
    /* older router / unsupported navigator */
  }
}

/** Push immediately; run heavy work after the transition finishes. */
export function pushThen(href: Href, work?: () => void | Promise<void>) {
  router.push(href);
  if (!work) return;
  InteractionManager.runAfterInteractions(() => {
    void work();
  });
}

/** Replace immediately; run heavy work after the transition finishes. */
export function replaceThen(href: Href, work?: () => void | Promise<void>) {
  router.replace(href);
  if (!work) return;
  InteractionManager.runAfterInteractions(() => {
    void work();
  });
}
