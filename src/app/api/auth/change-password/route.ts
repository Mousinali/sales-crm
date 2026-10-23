import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "../../../../lib/db";
import { getCurrentUserFromRequest } from "../../../../lib/auth/rbac";
import { changePassword } from "../../../../lib/auth/changePassword";

const changePasswordSchema = z.object({ password: z.string().min(8) });

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  await changePassword(pool, { userId: user.id, newPassword: parsed.data.password });
  return NextResponse.json({ ok: true });
}
