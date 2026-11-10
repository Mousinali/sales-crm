import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { updateOwnAvatar } from "@/lib/users/update";

// A compressed (client-resized) JPEG/PNG/WebP data URL. Capped well above
// what a sensibly-compressed profile photo needs, to block someone from
// pasting an uncompressed multi-megabyte image in as base64.
const avatarSchema = z.object({
  avatarUrl: z
    .string()
    .regex(/^data:image\/(jpeg|png|webp);base64,/)
    .max(400_000)
    .nullable(),
});

export async function PATCH(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = avatarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid image" }, { status: 400 });
  }

  await updateOwnAvatar(pool, user.id, parsed.data.avatarUrl);
  return NextResponse.json({ ok: true, avatarUrl: parsed.data.avatarUrl });
}
