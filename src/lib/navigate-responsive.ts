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

/** Run work after the current navigation/animation settles. */
export function runAfterNav(work: () => void | Promise<void>) {
  InteractionManager.runAfterInteractions(() => {
    void work();
  });
}

/** Push immediately; run heavy work after the transition finishes. */
export function pushThen(href: Href, work?: () => void | Promise<void>) {
  router.push(href);
  if (work) runAfterNav(work);
}

/** Replace immediately; run heavy work after the transition finishes. */
export function replaceThen(href: Href, work?: () => void | Promise<void>) {
  router.replace(href);
  if (work) runAfterNav(work);
}

/** Leave the screen immediately, then persist / clean up in the background. */
export function leaveThen(leave: () => void, work?: () => void | Promise<void>) {
  leave();
  if (work) runAfterNav(work);
}
