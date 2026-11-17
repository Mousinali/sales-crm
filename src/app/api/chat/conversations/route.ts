import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { listConversations } from "@/lib/chat/crud";
import { listGroups } from "@/lib/chat/groups";

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [conversations, groups] = await Promise.all([listConversations(pool, user.id), listGroups(pool, user.id)]);
  return NextResponse.json({ conversations, groups });
}
