import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { updateUserProfile, setUserStatus, archiveUser } from "@/lib/users/update";
import { RoleNotManageableError, UserNotFoundError, EmailAlreadyExistsError, UserActionNotAllowedError } from "@/lib/users/errors";

const patchSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    email: z.string().trim().email().optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    employeeId: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    whatsappNumber: z.string().trim().optional(),
    designation: z.string().trim().optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.email !== undefined ||
      data.status !== undefined ||
      data.employeeId !== undefined ||
      data.phone !== undefined ||
      data.whatsappNumber !== undefined ||
      data.designation !== undefined,
    { message: "No fields to update" },
  );

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const targetId = Number(id);
  if (!Number.isInteger(targetId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    if (
      parsed.data.name !== undefined ||
      parsed.data.email !== undefined ||
      parsed.data.employeeId !== undefined ||
      parsed.data.phone !== undefined ||
      parsed.data.whatsappNumber !== undefined ||
      parsed.data.designation !== undefined
    ) {
      await updateUserProfile(pool, {
        actorId: user.id,
        actorRole: user.role,
        targetId,
        name: parsed.data.name,
        email: parsed.data.email,
        employeeId: parsed.data.employeeId,
        phone: parsed.data.phone,
        whatsappNumber: parsed.data.whatsappNumber,
        designation: parsed.data.designation,
      });
    }
    if (parsed.data.status !== undefined) {
      await setUserStatus(pool, { actorId: user.id, actorRole: user.role, targetId, status: parsed.data.status });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RoleNotManageableError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof UserNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (error instanceof EmailAlreadyExistsError) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const targetId = Number(id);
  if (!Number.isInteger(targetId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    await archiveUser(pool, { actorId: user.id, actorRole: user.role, targetId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RoleNotManageableError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof UserNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (error instanceof UserActionNotAllowedError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
