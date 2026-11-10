import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { findPotentialDuplicates } from "@/lib/leads/duplicates";

const duplicatesQuerySchema = z.object({
  companyName: z.string().trim().min(1),
  phone: z.string().trim().min(1).optional(),
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
  // Only the roles that can create a lead need to check for duplicates
  // before saving one; every other role gets 403 rather than a free-form
  // search over every lead's contact details.
  if (user.role !== "PRE_SALES" && user.role !== "MARKETING_HEAD" && user.role !== "SALESPERSON") {
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
  // A minimal projection — enough for a "this looks like it might already
  // exist" warning, not a way to read another lead's full contact/service
  // details through the duplicate-check endpoint.
  return NextResponse.json({
    duplicates: duplicates.map((lead) => ({ id: lead.id, companyName: lead.company_name, status: lead.status })),
  });
}
