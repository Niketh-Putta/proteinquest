/**
 * Flexible parsing for nutrition numbers users type/paste from packaging.
 * Accepts: 12g, 12 g, 12.5, 12,5, ~12, 12kcal, 12 cal, 1,234, etc.
 */

const UNIT_RE =
  /\b(?:k(?:cal|j)|cals?|calories?|grams?|grammes?|g|mg|µg|ug|mcg)\b/gi;

/** Keep draft text friendly while typing / pasting label values. */
export function sanitizeNutritionDraft(raw: string, maxLen = 16): string {
  return String(raw ?? '')
    .replace(UNIT_RE, '')
    .replace(/[^0-9.,~\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/**
 * Parse a nutrition amount. Returns null for empty/invalid (caller decides fallback).
 * Never throws.
 */
export function parseNutritionNumber(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }

  let s = String(raw).trim();
  if (!s) return null;

  s = s.replace(/~/g, '');
  s = s.replace(UNIT_RE, '');
  s = s.replace(/\s+/g, '');
  if (!s) return null;

  // Keep digits, separators, and a single leading minus (labels are usually positive).
  s = s.replace(/[^0-9.,\-]/g, '');
  if (!s || s === '-' || s === '.' || s === ',') return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma >= 0 && lastDot >= 0) {
    // Both present: the rightmost separator is the decimal.
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    const after = s.slice(lastComma + 1);
    // "12,5" / "1,25" → decimal; "1,234" → thousands
    if (after.length > 0 && after.length <= 2 && /^\d+$/.test(after)) {
      s = s.replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  }

  // Multiple dots after cleanup (rare): keep first as decimal, drop rest.
  const firstDot = s.indexOf('.');
  if (firstDot >= 0) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
