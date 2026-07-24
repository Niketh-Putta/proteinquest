import { findCameraVideo } from './web-barcode';

function isMirroredTransform(transform: string): boolean {
  const t = transform.trim();
  if (!t || t === 'none') return false;
  if (/scaleX\s*\(\s*-1\s*\)/i.test(t)) return true;
  // RN Web often serializes scaleX(-1) as matrix(-1, 0, 0, 1, tx, ty)
  if (/^matrix\s*\(\s*-1(?:\.0+)?\s*,/i.test(t)) return true;
  if (/^matrix3d\s*\(\s*-1(?:\.0+)?\s*,/i.test(t)) return true;
  return false;
}

/**
 * expo-camera web hardcodes a selfie-style preview flip when the stream is
 * treated as front (`scaleX(-1)` on the <video>). Desktop often has no
 * facingMode and defaults to front. Capture with `isImageMirror: false` does
 * not flip, so preview ≠ confirm unless we strip the CSS mirror.
 */
export function bindUnmirroredWebCameraPreview(root: unknown): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  let observer: MutationObserver | null = null;
  let watched: HTMLVideoElement | null = null;
  // Keep polling briefly: expo-camera re-applies scaleX(-1) when stream type resolves.
  const pollId = window.setInterval(() => {
    const video = findCameraVideo(root);
    if (!video) return;
    stripMirror(video);
    if (watched !== video) {
      observer?.disconnect();
      watched = video;
      observer = new MutationObserver(() => stripMirror(video));
      observer.observe(video, { attributes: true, attributeFilter: ['style', 'class'] });
    }
  }, 100);

  function stripMirror(video: HTMLVideoElement) {
    const inline = video.style.transform;
    if (inline && isMirroredTransform(inline)) {
      video.style.setProperty('transform', 'none', 'important');
      return;
    }
    // Some RN Web paths leave inline empty but still apply a mirrored transform.
    const computed = window.getComputedStyle(video).transform;
    if (isMirroredTransform(computed)) {
      video.style.setProperty('transform', 'none', 'important');
    }
  }

  return () => {
    window.clearInterval(pollId);
    observer?.disconnect();
    watched = null;
  };
}
