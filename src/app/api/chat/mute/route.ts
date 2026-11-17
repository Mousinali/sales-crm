import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { setMuted } from "@/lib/chat/crud";
import { ChatRecipientNotFoundError } from "@/lib/chat/errors";

const schema = z.object({ userId: z.number().int(), muted: z.boolean() });

// POST { userId, muted: true|false } — toggles muteing the other person in a direct chat.
export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.mustChangePassword) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    await setMuted(pool, user.id, parsed.data.userId, parsed.data.muted);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ChatRecipientNotFoundError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
