/**
 * Web barcode detect helpers (BarcodeDetector + barcode-detector/zxing).
 * Speed-first: every-frame rAF caller, tiny center ROI, native∥zxing race, escalate only on misses.
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
let nativeTried = false;
/** Consecutive misses — escalate decode strategy only after this grows. */
let missStreak = 0;
let sharedCanvas: HTMLCanvasElement | null = null;
let sharedCtx: CanvasRenderingContext2D | null = null;
/** Reused ImageBitmap close target from prior frame (avoid GC thrash). */
let lastBitmap: ImageBitmap | null = null;

function digitsOrRaw(raw: string): string {
  const trimmed = String(raw || '').trim();
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 6 ? digits : trimmed;
}

/** Normalize zxing / native format strings to underscore form. */
function normalizeFormat(format?: string): string {
  const f = String(format || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  const aliases: Record<string, string> = {
    ean13: 'ean_13',
    ean_13: 'ean_13',
    ean8: 'ean_8',
    ean_8: 'ean_8',
    upca: 'upc_a',
    upc_a: 'upc_a',
    upc_a_code: 'upc_a',
    upce: 'upc_e',
    upc_e: 'upc_e',
    code128: 'code_128',
    code_128: 'code_128',
    code39: 'code_39',
    code_39: 'code_39',
    codabar: 'codabar',
    itf: 'itf',
    itf14: 'itf',
    qr: 'qr_code',
    qr_code: 'qr_code',
    qrcode: 'qr_code',
  };
  return aliases[f] || f;
}

function pickHit(hits: Array<{ rawValue?: string; format?: string }>): WebBarcodeHit | null {
  let fallback: WebBarcodeHit | null = null;
  for (const hit of hits) {
    const data = digitsOrRaw(hit.rawValue ?? '');
    if (data.length < 6) continue;
    const type = normalizeFormat(hit.format);
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

function getNativeDetectorSync(): DetectorLike | null {
  return nativeDetector ?? null;
}

function getPolyfillDetectorSync(): DetectorLike | null {
  return polyfillDetector ?? null;
}

async function getNativeDetector(): Promise<DetectorLike | null> {
  if (nativeTried) return nativeDetector ?? null;
  nativeTried = true;
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
        const set = new Set(supported.map((s) => normalizeFormat(s)));
        formats = WEB_FORMATS.filter((f) => set.has(f) || set.has(f.replace(/_/g, '')));
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

/** Warm wasm / native detectors so the first real frame is not cold. */
export async function warmWebBarcodeDetectors(): Promise<void> {
  await Promise.all([getNativeDetector(), getPolyfillDetector()]);
}

function getSharedCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null;
  if (!sharedCanvas) {
    sharedCanvas = document.createElement('canvas');
    sharedCtx = sharedCanvas.getContext('2d', { willReadFrequently: true, alpha: false });
  }
  if (!sharedCtx) return null;
  if (sharedCanvas.width !== w) sharedCanvas.width = w;
  if (sharedCanvas.height !== h) sharedCanvas.height = h;
  return { canvas: sharedCanvas, ctx: sharedCtx };
}

function closeLastBitmap() {
  if (lastBitmap) {
    try {
      lastBitmap.close();
    } catch {
      /* ignore */
    }
    lastBitmap = null;
  }
}

/**
 * Center horizontal strip at ~half-res (fast path).
 * Prefer createImageBitmap crop+resize; fall back to shared canvas draw.
 */
async function grabCenterRoi(
  video: HTMLVideoElement,
  vw: number,
  vh: number,
  maxSide: number,
): Promise<ImageBitmap | HTMLCanvasElement | null> {
  // Tight center band ≈ on-screen barcode rectangle.
  const sx = Math.round(vw * 0.18);
  const sy = Math.round(vh * 0.34);
  const sw = Math.round(vw * 0.64);
  const sh = Math.round(vh * 0.32);
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));

  closeLastBitmap();
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(video, sx, sy, sw, sh, {
        resizeWidth: w,
        resizeHeight: h,
        resizeQuality: 'pixelated',
      } as ImageBitmapOptions);
      lastBitmap = bmp;
      return bmp;
    } catch {
      /* canvas fallback */
    }
  }

  const shared = getSharedCanvas(w, h);
  if (!shared) return null;
  shared.ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
  return shared.canvas;
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
  const shared = getSharedCanvas(w, h);
  if (!shared) return null;
  shared.ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
  return shared.canvas;
}

async function detectOn(
  detector: DetectorLike,
  source: ImageBitmap | HTMLCanvasElement | HTMLVideoElement,
): Promise<WebBarcodeHit | null> {
  try {
    return pickHit(await detector.detect(source));
  } catch {
    return null;
  }
}

/** First non-null hit wins; misses wait for peers. */
function raceFirstHit(tasks: Array<Promise<WebBarcodeHit | null>>): Promise<WebBarcodeHit | null> {
  if (!tasks.length) return Promise.resolve(null);
  return new Promise((resolve) => {
    let pending = tasks.length;
    let done = false;
    for (const task of tasks) {
      void task.then(
        (hit) => {
          if (done) return;
          if (hit) {
            done = true;
            resolve(hit);
            return;
          }
          pending -= 1;
          if (pending <= 0) resolve(null);
        },
        () => {
          if (done) return;
          pending -= 1;
          if (pending <= 0) resolve(null);
        },
      );
    }
  });
}

/**
 * Detect product barcodes from a live HTMLVideoElement.
 * Fast path (every frame): half-res center strip + native∥zxing race (first win).
 * Escalates only after consecutive misses (larger crop / rare contrast).
 */
export async function detectBarcodeFromVideo(video: HTMLVideoElement): Promise<WebBarcodeHit | null> {
  if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  // Hot path: sync detectors only (warmed in background). Kick warm if cold.
  let native = getNativeDetectorSync();
  let poly = getPolyfillDetectorSync();
  if (!nativeTried || !polyfillTried) {
    void warmWebBarcodeDetectors();
  }
  if (!native && !poly) {
    // Cold start: await once, then next frames are sync.
    const [n, p] = await Promise.all([getNativeDetector(), getPolyfillDetector()]);
    native = n;
    poly = p;
  }
  if (!native && !poly) return null;

  const streak = missStreak;
  // Half-res strip first (~320px); grow only after misses.
  const fastMax = streak < 3 ? 320 : streak < 8 ? 480 : 640;

  // Race: start native on <video> immediately (no ROI wait) ∥ zxing on half-res strip.
  const tasks: Array<Promise<WebBarcodeHit | null>> = [];
  if (native) {
    // Chrome BarcodeDetector on <video> is often sub-frame when the code is visible.
    tasks.push(detectOn(native, video));
  }
  if (poly || native) {
    tasks.push(
      (async () => {
        const roi = await grabCenterRoi(video, vw, vh, fastMax);
        if (!roi) return null;
        // Prefer zxing on ROI; fall back to native crop when poly missing.
        return detectOn(poly || native!, roi);
      })(),
    );
  }

  let hit = await raceFirstHit(tasks);
  if (hit) {
    missStreak = 0;
    return hit;
  }

  // Escalate: slightly wider / full-frame downscale only after sustained misses.
  if (streak >= 6) {
    const full = drawVideoRegion(video, 0, 0, vw, vh, 560);
    if (full) {
      const escalate: Array<Promise<WebBarcodeHit | null>> = [];
      if (poly) escalate.push(detectOn(poly, full));
      if (native) escalate.push(detectOn(native, full));
      hit = await raceFirstHit(escalate);
      if (hit) {
        missStreak = 0;
        return hit;
      }
    }
  }

  missStreak = Math.min(missStreak + 1, 40);
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

  const all = Array.from(document.querySelectorAll('video')) as HTMLVideoElement[];
  return all.find(isLiveCameraVideo) ?? null;
}
