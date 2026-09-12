import { timingSafeEqual } from "node:crypto";
import { signSession, verifySession } from "@/lib/session";

export const COOKIE_NAME = "pq_growth_session";
export const SESSION_SECONDS = 8 * 3600;

export async function signSessionToken(secret: string, issuedAt = Math.floor(Date.now() / 1000)) {
  return signSession(secret, issuedAt);
}

export async function verifySessionToken(token: string, secret: string) {
  return verifySession(token, secret);
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function credentialsConfigured(): boolean {
  return Boolean(
    process.env.DASHBOARD_EMAIL?.trim() &&
      process.env.DASHBOARD_PASSWORD &&
      process.env.DASHBOARD_SESSION_SECRET,
  );
}

export function verifyOwnerLogin(email: string, password: string): boolean {
  const expectedEmail = process.env.DASHBOARD_EMAIL?.trim().toLowerCase() ?? "";
  const expectedPassword = process.env.DASHBOARD_PASSWORD ?? "";
  if (!expectedEmail || !expectedPassword) return false;
  return safeEqual(email.trim().toLowerCase(), expectedEmail) && safeEqual(password, expectedPassword);
}

export function sessionCookie(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_SECONDS,
  };
}
