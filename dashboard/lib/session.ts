const SESSION_SECONDS = 8 * 3600;

function b64url(bytes: ArrayBuffer | Uint8Array) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const b of buf) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return b64url(sig);
}

export async function signSession(secret: string, issuedAt = Math.floor(Date.now() / 1000)) {
  return `${issuedAt}.${await hmac(secret, `admin:${issuedAt}`)}`;
}

export async function verifySession(token: string, secret: string): Promise<boolean> {
  const [issuedStr, sig] = token.split(".");
  if (!issuedStr || !sig) return false;
  const issuedAt = Number.parseInt(issuedStr, 10);
  if (!Number.isFinite(issuedAt)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (issuedAt > now + 60 || now - issuedAt > SESSION_SECONDS) return false;
  return sig === (await hmac(secret, `admin:${issuedAt}`));
}
