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
  'codabar',
  'itf',
  'qr_code',
] as const;

const PRODUCT_FORMATS = new Set(['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39']);

type DetectorLike = {
  detect: (source: ImageBitmap | HTMLCanvasElement | HTMLVideoElement) => Promise<
    Array<{ rawValue?: string; format?: string }>
  >;
};

let nativeDetector: DetectorLike | null | undefined;
let polyfillDetector: DetectorLike | null | undefined;
let polyfillTried = false;

function digitsOrRaw(raw: string): string {
  const trimmed = String(raw || '').trim();
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 6 ? digits : trimmed;
}

function pickHit(hits: Array<{ rawValue?: string; format?: string }>): WebBarcodeHit | null {
  let fallback: WebBarcodeHit | null = null;
  for (const hit of hits) {
    const data = digitsOrRaw(hit.rawValue ?? '');
    if (data.length < 6) continue;
    const type = hit.format ?? 'unknown';
    const candidate = { data, type };
    if (PRODUCT_FORMATS.has(type) || /^\d{8,14}$/.test(data)) return candidate;
    if (!fallback) fallback = candidate;
  }
  return fallback;
}

type NativeBarcodeDetectorCtor = {
  new (opts: { formats: string[] }): DetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};

async function getNativeDetector(): Promise<DetectorLike | null> {
  if (nativeDetector !== undefined) return nativeDetector;
  try {
    const Native = (globalThis as unknown as { BarcodeDetector?: NativeBarcodeDetectorCtor })
      .BarcodeDetector;
    if (typeof Native !== 'function') {
      nativeDetector = null;
      return null;
    }
    let formats: string[] = [...WEB_FORMATS];
    try {
      const supported =
        typeof Native.getSupportedFormats === 'function' ? await Native.getSupportedFormats() : [];
      if (Array.isArray(supported) && supported.length) {
        const set = new Set(supported);
        formats = WEB_FORMATS.filter((f) => set.has(f));
        // Native exists but cannot read retail codes → prefer polyfill only.
        if (!formats.some((f) => PRODUCT_FORMATS.has(f))) {
          nativeDetector = null;
          return null;
        }
      }
    } catch {
      /* use default formats */
    }
    nativeDetector = new Native({ formats });
    return nativeDetector;
  } catch {
    nativeDetector = null;
    return null;
  }
}

async function getPolyfillDetector(): Promise<DetectorLike | null> {
  if (polyfillTried) return polyfillDetector ?? null;
  polyfillTried = true;
  try {
    const mod = await import('barcode-detector');
    try {
      // Warm zxing wasm so the first real frame is less likely to miss.
      void mod.prepareZXingModule?.();
    } catch {
      /* optional warmup */
    }
    const Poly = mod.BarcodeDetector as unknown as new (opts: { formats: string[] }) => DetectorLike;
    polyfillDetector = new Poly({ formats: [...WEB_FORMATS] });
    return polyfillDetector;
  } catch {
    polyfillDetector = null;
    return null;
  }
}

function drawVideoRegion(
  video: HTMLVideoElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  maxSide: number,
): HTMLCanvasElement | null {
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
  return canvas;
}

async function detectOnCanvas(
  detector: DetectorLike,
  canvas: HTMLCanvasElement,
): Promise<WebBarcodeHit | null> {
  try {
    return pickHit(await detector.detect(canvas));
  } catch {
    return null;
  }
}

let detectPass = 0;

/**
 * Detect product barcodes from a live HTMLVideoElement.
 * Rotates full-frame / center-ROI / scale / native+zxing so each poll stays fast
 * but successive frames cover aggressive decode strategies.
 */
export async function detectBarcodeFromVideo(video: HTMLVideoElement): Promise<WebBarcodeHit | null> {
  if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  const native = await getNativeDetector();
  const poly = await getPolyfillDetector();
  const detectors = [poly, native].filter(Boolean) as DetectorLike[];
  if (!detectors.length) return null;

  const pass = detectPass++;
  // Prefer polyfill first (reliable UPC/EAN on Windows/Linux where native is weak).
  const detector = detectors[pass % detectors.length];
  const regions: Array<[number, number, number, number]> = [
    // Center band matches the on-screen barcode rectangle.
    [Math.round(vw * 0.12), Math.round(vh * 0.28), Math.round(vw * 0.76), Math.round(vh * 0.44)],
    [0, 0, vw, vh],
    [Math.round(vw * 0.08), Math.round(vh * 0.36), Math.round(vw * 0.84), Math.round(vh * 0.28)],
  ];
  const region = regions[pass % regions.length];
  const maxSide = pass % 3 === 0 ? 1280 : pass % 3 === 1 ? 960 : 720;

  const canvas = drawVideoRegion(video, region[0], region[1], region[2], region[3], maxSide);
  if (!canvas) return null;
  let hit = await detectOnCanvas(detector, canvas);
  if (hit) return hit;

  // Immediate second try: other detector on the same crop (still only 2 detects/tick).
  const other = detectors[(pass + 1) % detectors.length];
  if (other && other !== detector) {
    hit = await detectOnCanvas(other, canvas);
    if (hit) return hit;
  }
  return null;
}

function isLiveCameraVideo(el: HTMLVideoElement): boolean {
  if (!el.videoWidth || !el.videoHeight) return false;
  if (el.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return false;
  const src = el.srcObject;
  return !!src && typeof MediaStream !== 'undefined' && src instanceof MediaStream;
}

/** Find the live camera <video> under a react-native-web View root (or document fallback). */
export function findCameraVideo(root: unknown): HTMLVideoElement | null {
  if (typeof document === 'undefined') return null;

  const fromNode = (node: ParentNode | null | undefined): HTMLVideoElement | null => {
    if (!node || typeof (node as ParentNode).querySelector !== 'function') return null;
    const direct = (node as ParentNode).querySelector('video') as HTMLVideoElement | null;
    if (direct && isLiveCameraVideo(direct)) return direct;
    const all = Array.from((node as ParentNode).querySelectorAll('video')) as HTMLVideoElement[];
    return all.find(isLiveCameraVideo) ?? all[0] ?? null;
  };

  const el = root as { querySelector?: (sel: string) => Element | null } | null;
  const local = fromNode(el as unknown as ParentNode);
  if (local) return local;

  // RN-web refs sometimes miss the host node; fall back to any live camera video.
  const all = Array.from(document.querySelectorAll('video')) as HTMLVideoElement[];
  return all.find(isLiveCameraVideo) ?? null;
}
