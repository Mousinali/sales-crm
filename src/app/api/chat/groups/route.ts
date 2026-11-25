import { NextResponse } from "next/server";
import { logActivity } from "@/lib/audit/log";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { createGroup, listGroups } from "@/lib/chat/groups";
import { getIO } from "@/lib/socket";
import { ChatRecipientNotFoundError } from "@/lib/chat/errors";

const createSchema = z.object({ name: z.string().trim().min(1).max(80), memberIds: z.array(z.number().int()).min(1) });

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.mustChangePassword) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ groups: await listGroups(pool, user.id) });
}

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.mustChangePassword) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Give the team chat a name and pick at least one member" }, { status: 400 });

  try {
    const { id } = await createGroup(pool, { creatorId: user.id, name: parsed.data.name, memberIds: parsed.data.memberIds });
    // Already-connected members start receiving the group's live messages right away.
    for (const memberId of [user.id, ...parsed.data.memberIds]) getIO()?.in(`user:${memberId}`).socketsJoin(`group:${id}`);
    await logActivity(pool, { actorUserId: user.id, action: "team.created", targetTable: "chat_groups", targetId: id, details: { name: parsed.data.name } });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof ChatRecipientNotFoundError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
