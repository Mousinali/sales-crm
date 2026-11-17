import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { listLeadShares, shareLead, unshareLead } from "@/lib/leads/share";
import { LeadNotFoundError, LeadNotAccessibleError, LeadActionNotAllowedError } from "@/lib/leads/errors";

const bodySchema = z.object({ userId: z.number().int() });

async function handle(
  request: Request,
  params: Promise<{ id: string }>,
  run: (user: { id: number; role: import("@/lib/auth/roles").Role }, leadId: number, body: z.infer<typeof bodySchema> | null) => Promise<unknown>,
  needsBody: boolean,
): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const leadId = Number((await params).id);
  if (!Number.isInteger(leadId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: z.infer<typeof bodySchema> | null = null;
  if (needsBody) {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    body = parsed.data;
  }

  try {
    return NextResponse.json(await run(user, leadId, body));
  } catch (error) {
    if (error instanceof LeadActionNotAllowedError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof LeadNotFoundError || error instanceof LeadNotAccessibleError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }
}

type Ctx = { params: Promise<{ id: string }> };

export const GET = (request: Request, { params }: Ctx) =>
  handle(request, params, async (user, leadId) => ({ shares: await listLeadShares(pool, user, leadId) }), false);

export const POST = (request: Request, { params }: Ctx) =>
  handle(request, params, async (user, leadId, body) => (await shareLead(pool, user, leadId, body!.userId), { ok: true }), true);

export const DELETE = (request: Request, { params }: Ctx) =>
  handle(request, params, async (user, leadId, body) => (await unshareLead(pool, user, leadId, body!.userId), { ok: true }), true);
