import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { bulkShareLeads } from "@/lib/leads/share";
import { LeadNotFoundError, LeadNotAccessibleError, LeadActionNotAllowedError } from "@/lib/leads/errors";

const bodySchema = z.object({
  leadIds: z.array(z.number().int()).min(1),
  userIds: z.array(z.number().int()).min(1),
});

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    return NextResponse.json(await bulkShareLeads(pool, user, parsed.data.leadIds, parsed.data.userIds));
  } catch (error) {
    if (error instanceof LeadActionNotAllowedError || error instanceof LeadNotAccessibleError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof LeadNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }
}
