import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { updateOwnContactDetails } from "@/lib/users/update";

const patchSchema = z
  .object({
    phone: z.string().trim().optional(),
    whatsappNumber: z.string().trim().optional(),
  })
  .refine((data) => data.phone !== undefined || data.whatsappNumber !== undefined, {
    message: "No fields to update",
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
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  await updateOwnContactDetails(pool, user.id, parsed.data);
  return NextResponse.json({ ok: true });
}
