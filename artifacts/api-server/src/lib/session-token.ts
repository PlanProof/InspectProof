import crypto from "crypto";

const APP_SECRET = process.env.APP_SECRET || process.env.SESSION_SECRET;
if (!APP_SECRET) {
  throw new Error("APP_SECRET (or SESSION_SECRET) environment variable is required but not set.");
}

const SESSION_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

export function createSessionToken(userId: number): string {
  const expiry = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const data = `${userId}:${expiry}`;
  const sig = crypto.createHmac("sha256", APP_SECRET).update(data).digest("hex");
  return Buffer.from(`${data}:${sig}`).toString("base64url");
}

export function decodeSessionToken(token: string): { userId: number; valid: boolean; expired: boolean } {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf-8");
    const lastColon = raw.lastIndexOf(":");
    if (lastColon === -1) return { userId: 0, valid: false, expired: false };
    const sig = raw.slice(lastColon + 1);
    const data = raw.slice(0, lastColon);
    const parts = data.split(":");
    if (parts.length !== 2) return { userId: 0, valid: false, expired: false };
    const userId = parseInt(parts[0], 10);
    const expiry = parseInt(parts[1], 10);
    if (isNaN(userId) || isNaN(expiry)) return { userId: 0, valid: false, expired: false };
    const expected = crypto.createHmac("sha256", APP_SECRET).update(data).digest("hex");
    const expectedBuf = Buffer.from(expected, "hex");
    const sigBuf = Buffer.from(sig, "hex");
    if (expectedBuf.length !== sigBuf.length || !crypto.timingSafeEqual(expectedBuf, sigBuf)) {
      return { userId: 0, valid: false, expired: false };
    }
    const now = Math.floor(Date.now() / 1000);
    if (now > expiry) return { userId, valid: false, expired: true };
    return { userId, valid: true, expired: false };
  } catch {
    return { userId: 0, valid: false, expired: false };
  }
}
