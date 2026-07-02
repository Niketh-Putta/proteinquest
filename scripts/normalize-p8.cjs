/** Normalize APPLE_ASC_API_KEY_P8 / .p8 contents from GitHub secrets. */
function normalizeP8(raw) {
  let key = String(raw ?? '').trim();
  if (!key) return '';

  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }

  if (key.includes('\\n')) {
    key = key.replace(/\\n/g, '\n');
  }

  key = key.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const pemMatch = key.match(
    /-----BEGIN (?:EC )?PRIVATE KEY-----[\s\S]*?-----END (?:EC )?PRIVATE KEY-----/,
  );
  if (pemMatch) {
    return `${pemMatch[0].trim()}\n`;
  }

  const body = key.replace(/[^A-Za-z0-9+/=]/g, '');
  if (!body) return '';
  return `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`;
}

function normalizeKeyId(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, '');
}

module.exports = { normalizeP8, normalizeKeyId };
