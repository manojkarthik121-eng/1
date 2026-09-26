// Optional single-password login for running Luminary on the internet.
// Enabled when LUMINARY_PASSWORD is set. Sessions are stateless signed
// cookies, so they survive restarts; changing the password logs everyone out.
import crypto from "node:crypto";

export const COOKIE = "luminary_session";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

const sha256 = (value) => crypto.createHash("sha256").update(value).digest();

export function createAuth(password) {
  if (!password) return null;
  const key = sha256(`luminary-session:${password}`);
  const sign = (payload) => crypto.createHmac("sha256", key).update(payload).digest("base64url");
  const attempts = new Map();

  return {
    checkPassword(attempt) {
      return crypto.timingSafeEqual(sha256(String(attempt ?? "")), sha256(password));
    },

    issue(now = Date.now()) {
      const payload = String(now + MAX_AGE_MS);
      return `${payload}.${sign(payload)}`;
    },

    valid(token, now = Date.now()) {
      if (typeof token !== "string") return false;
      const [payload, sig] = token.split(".");
      if (!payload || !sig) return false;
      const expected = sign(payload);
      if (sig.length !== expected.length) return false;
      if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
      return Number(payload) > now;
    },

    // Simple per-IP limiter to slow down password guessing.
    tooManyAttempts(ip, now = Date.now()) {
      const entry = attempts.get(ip);
      if (!entry || entry.reset < now) {
        attempts.set(ip, { count: 1, reset: now + WINDOW_MS });
        return false;
      }
      entry.count += 1;
      return entry.count > MAX_ATTEMPTS;
    },

    clearAttempts(ip) {
      attempts.delete(ip);
    },

    cookie(token, secure) {
      return [
        `${COOKIE}=${token}`,
        "Path=/",
        "HttpOnly",
        "SameSite=Lax",
        `Max-Age=${token ? Math.floor(MAX_AGE_MS / 1000) : 0}`,
        secure ? "Secure" : "",
      ].filter(Boolean).join("; ");
    },
  };
}

export function readCookie(req, name = COOKIE) {
  for (const part of (req.headers.cookie || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

export const isLoopback = (host) => ["127.0.0.1", "localhost", "::1"].includes(host);
