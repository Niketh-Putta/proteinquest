/**
 * Web barcode detect helpers (BarcodeDetector + barcode-detector/zxing fallback).
 * Used when expo-camera's built-in web scanner misses frames or wasm fails to warm.
 */

export type WebBarcodeHit = {
  data: string;
  type: string;
};

const WEB_FORMATS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'qr_code',
] as const;

type DetectorLike = {
  detect: (source: ImageBitmap | HTMLCanvasElement | HTMLVideoElement) => Promise<
    Array<{ rawValue?: string; format?: string }>
  >;
};

let detectorPromise: Promise<DetectorLike | null> | null = null;

async function getDetector(): Promise<DetectorLike | null> {
  if (detectorPromise) return detectorPromise;
  detectorPromise = (async () => {
    try {
      const Native = (globalThis as { BarcodeDetector?: new (opts: { formats: string[] }) => DetectorLike })
        .BarcodeDetector;
      if (typeof Native === 'function') {
        return new Native({ formats: [...WEB_FORMATS] });
      }
    } catch {
      /* try polyfill */
    }
    try {
      const mod = await import('barcode-detector');
      const Poly = mod.BarcodeDetector as unknown as new (opts: { formats: string[] }) => DetectorLike;
      return new Poly({ formats: [...WEB_FORMATS] });
    } catch {
      return null;
    }
  })();
  return detectorPromise;
}

function digitsOrRaw(raw: string): string {
  const trimmed = String(raw || '').trim();
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 6 ? digits : trimmed;
}

/**
 * Detect product barcodes from a live HTMLVideoElement.
 * Prefers canvas frames (broader browser support than createImageBitmap alone).
 */
export async function detectBarcodeFromVideo(video: HTMLVideoElement): Promise<WebBarcodeHit | null> {
  if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  const detector = await getDetector();
  if (!detector) return null;

  // Downscale large frames for speed; keep enough detail for EAN/UPC.
  const maxSide = 960;
  const scale = Math.min(1, maxSide / Math.max(vw, vh));
  const w = Math.max(1, Math.round(vw * scale));
  const h = Math.max(1, Math.round(vh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);

  try {
    const hits = await detector.detect(canvas);
    for (const hit of hits) {
      const data = digitsOrRaw(hit.rawValue ?? '');
      if (data.length >= 6) {
        return { data, type: hit.format ?? 'unknown' };
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** Find the live camera <video> under a react-native-web View root. */
export function findCameraVideo(root: unknown): HTMLVideoElement | null {
  if (!root || typeof document === 'undefined') return null;
  const el = root as { querySelector?: (sel: string) => Element | null };
  if (typeof el.querySelector !== 'function') return null;
  return (el.querySelector('video') as HTMLVideoElement | null) ?? null;
}
