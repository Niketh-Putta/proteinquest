import { NextResponse } from "next/server";
import { credentialsConfigured, sessionCookie, signSessionToken, verifyOwnerLogin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const form = await req.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const nextPath = String(form.get("next") ?? "/");
  const dest = nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/";

  if (!credentialsConfigured() || !verifyOwnerLogin(email, password)) {
    return NextResponse.redirect(new URL(`/login?error=invalid&next=${encodeURIComponent(dest)}`, req.url), 303);
  }

  const token = await signSessionToken(process.env.DASHBOARD_SESSION_SECRET!);
  const res = NextResponse.redirect(new URL(dest, req.url), 303);
  res.cookies.set(sessionCookie(token));
  return res;
}
