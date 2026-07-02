/** Normalize APPLE_ASC_API_KEY_P8 / .p8 contents from GitHub secrets. */
function normalizeP8(raw) {
  let key = String(raw ?? '').trim();
  if (!key) return '';
  if (key.includes('\\n')) {
    key = key.replace(/\\n/g, '\n');
  }
  if (key.includes('BEGIN PRIVATE KEY')) {
    return key;
  }
  const body = key.replace(/[^A-Za-z0-9+/=]/g, '');
  return `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`;
}

module.exports = { normalizeP8 };
