import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/passwords";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { checkRateLimit, resetRateLimit } from "@/lib/auth/rateLimit";

const LOGIN_RATE_LIMIT = 5;
const LOGIN_RATE_WINDOW_MS = 15 * 60_000;

// Deliberately `z.string().min(1)`, NOT `.email()`: the Super Admin's login
// identifier is the literal string "admin", not an RFC-shaped email address.
// A format check here would reject that credential on day one.
// `.trim()` guards against the same day-one-lockout risk via a different
// path: autofill/mobile-keyboard leading/trailing whitespace around
// "admin" would otherwise fail the exact `email = $1` match below. This is
// whitespace-only — no case-normalization/lowercasing, which would need a
// uniqueness-constraint change and is out of scope here.
const loginSchema = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(1),
});

export async function POST(request: Request): Promise<Response> {
  const body = await request.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
  }

  const { email, password } = parsed.data;

  // Keyed by email alone, not IP: this app has no trusted reverse-proxy
  // convention yet (nothing sets X-Forwarded-For authoritatively), so an
  // attacker-supplied IP header would let them reset the counter on every
  // request and fully bypass the limit. The tradeoff — a third party could
  // use this to lock a known victim's email out of login — is accepted as
  // the standard cost of email-keyed lockout; req.md only asks to
  // rate-limit login, not to survive a targeted denial-of-service.
  const rateLimitKey = `email:${email}`;
  if (!checkRateLimit(rateLimitKey, LOGIN_RATE_LIMIT, LOGIN_RATE_WINDOW_MS)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const { rows } = await pool.query<{ id: number; password_hash: string; status: "ACTIVE" | "INACTIVE" }>(
    "SELECT id, password_hash, status FROM users WHERE email = $1",
    [email],
  );
  const user = rows[0];

  if (!user || user.status !== "ACTIVE" || !(await verifyPassword(user.password_hash, password))) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  resetRateLimit(rateLimitKey);
  const { token, expiresAt } = await createSession(user.id);

  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return response;
}
