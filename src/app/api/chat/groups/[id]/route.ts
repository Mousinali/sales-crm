import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { getGroupDetail, addGroupMembers, setGroupMuted, leaveGroup } from "@/lib/chat/groups";
import { getIO } from "@/lib/socket";
import { ChatRecipientNotFoundError } from "@/lib/chat/errors";

const patchSchema = z.object({ addUserIds: z.array(z.number().int()).min(1).optional(), muted: z.boolean().optional() });

type Ctx = { params: Promise<{ id: string }> };

type Authed = { error: Response } | { error?: undefined; user: { id: number; name: string }; groupId: number };

async function authed(request: Request, params: Promise<{ id: string }>): Promise<Authed> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (user.mustChangePassword) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const groupId = Number((await params).id);
  if (!Number.isInteger(groupId)) return { error: NextResponse.json({ error: "Invalid id" }, { status: 400 }) };
  return { user, groupId };
}

export async function GET(request: Request, { params }: Ctx): Promise<Response> {
  const a = await authed(request, params);
  if (a.error) return a.error;
  try {
    return NextResponse.json(await getGroupDetail(pool, a.user.id, a.groupId));
  } catch (error) {
    if (error instanceof ChatRecipientNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw error;
  }
}

export async function PATCH(request: Request, { params }: Ctx): Promise<Response> {
  const a = await authed(request, params);
  if (a.error) return a.error;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    if (parsed.data.muted !== undefined) await setGroupMuted(pool, a.user.id, a.groupId, parsed.data.muted);
    if (parsed.data.addUserIds) {
      const added = await addGroupMembers(pool, a.user.id, a.groupId, parsed.data.addUserIds);
      for (const id of added) getIO()?.in(`user:${id}`).socketsJoin(`group:${a.groupId}`);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ChatRecipientNotFoundError) return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }
}

// DELETE = leave the team chat.
export async function DELETE(request: Request, { params }: Ctx): Promise<Response> {
  const a = await authed(request, params);
  if (a.error) return a.error;
  try {
    await leaveGroup(pool, a.user.id, a.groupId);
    getIO()?.in(`user:${a.user.id}`).socketsLeave(`group:${a.groupId}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ChatRecipientNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw error;
  }
}
