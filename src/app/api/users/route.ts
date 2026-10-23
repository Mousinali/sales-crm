import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "../../../lib/db";
import { getCurrentUserFromRequest } from "../../../lib/auth/rbac";
import { ROLES } from "../../../lib/auth/roles";
import { createUser } from "../../../lib/users/create";
import { RoleNotManageableError, EmailAlreadyExistsError } from "../../../lib/users/errors";

const createUserSchema = z.object({
  role: z.enum(ROLES),
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
});

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const created = await createUser(pool, {
      creatorId: user.id,
      creatorRole: user.role,
      role: parsed.data.role,
      name: parsed.data.name,
      email: parsed.data.email,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof RoleNotManageableError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof EmailAlreadyExistsError) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
    throw error;
  }
}
