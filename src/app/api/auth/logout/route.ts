import { NextResponse } from "next/server";
import { logActivity } from "@/lib/audit/log";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { revokeSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export async function POST(request: Request): Promise<Response> {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`));
  const token = match?.slice(SESSION_COOKIE_NAME.length + 1);

  if (token) {
    const user = await getCurrentUserFromRequest(request);
    await revokeSession(token);
    if (user) await logActivity(pool, { actorUserId: user.id, action: "user.logout" });
  }

  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.set(SESSION_COOKIE_NAME, "", { maxAge: 0, path: "/" });

  return response;
}
