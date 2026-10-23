import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "../../../../lib/db";
import { verifyPassword } from "../../../../lib/auth/passwords";
import { createSession, SESSION_COOKIE_NAME } from "../../../../lib/auth/session";

// Deliberately `z.string().min(1)`, NOT `.email()`: the Super Admin's login
// identifier is the literal string "admin", not an RFC-shaped email address.
// A format check here would reject that credential on day one.
const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(request: Request): Promise<Response> {
  const body = await request.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
  }

  const { email, password } = parsed.data;

  const { rows } = await pool.query<{ id: number; password_hash: string; status: "ACTIVE" | "INACTIVE" }>(
    "SELECT id, password_hash, status FROM users WHERE email = $1",
    [email],
  );
  const user = rows[0];

  if (!user || user.status !== "ACTIVE" || !(await verifyPassword(user.password_hash, password))) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

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
