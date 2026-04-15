/**
 * Edge-safe session verification (middleware). Must match `signDashboardSessionToken` in
 * `dashboard-session-node.ts` (HMAC-SHA256 over UTF-8 payload segment).
 */

function base64UrlToUint8Array(segment: string): Uint8Array {
  const pad = segment.length % 4 === 0 ? "" : "=".repeat(4 - (segment.length % 4));
  const b64 = segment.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function verifyDashboardSessionToken(token: string, secret: string): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return false;

  const encoder = new TextEncoder();
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch {
    return false;
  }

  let sig: Uint8Array;
  try {
    sig = base64UrlToUint8Array(sigB64);
  } catch {
    return false;
  }

  try {
    const ok = await crypto.subtle.verify("HMAC", key, sig as BufferSource, encoder.encode(payloadB64));
    if (!ok) return false;
  } catch {
    return false;
  }

  try {
    const json = new TextDecoder().decode(base64UrlToUint8Array(payloadB64));
    const o = JSON.parse(json) as { exp?: number };
    if (typeof o.exp !== "number" || o.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}
