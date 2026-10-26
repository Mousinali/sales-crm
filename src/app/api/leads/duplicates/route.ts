import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "../../../../lib/db";
import { getCurrentUserFromRequest } from "../../../../lib/auth/rbac";
import { findPotentialDuplicates } from "../../../../lib/leads/duplicates";

const duplicatesQuerySchema = z.object({
  companyName: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  email: z.string().trim().min(1).optional(),
  website: z.string().trim().min(1).optional(),
});

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = duplicatesQuerySchema.safeParse({
    companyName: url.searchParams.get("companyName") ?? undefined,
    phone: url.searchParams.get("phone") ?? undefined,
    email: url.searchParams.get("email") ?? undefined,
    website: url.searchParams.get("website") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const duplicates = await findPotentialDuplicates(pool, parsed.data);
  return NextResponse.json({ duplicates });
}
