import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { SERVICE_STATUSES } from "@/lib/services/types";
import { updateService } from "@/lib/services/update";
import { ServiceActionNotAllowedError, ServiceNotFoundError, ServiceNameAlreadyExistsError } from "@/lib/services/errors";

const patchSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    status: z.enum(SERVICE_STATUSES).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "No fields to update" });

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
  const serviceId = Number(id);
  if (!Number.isInteger(serviceId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const service = await updateService(pool, { actorId: user.id, actorRole: user.role, serviceId, fields: parsed.data });
    return NextResponse.json(service);
  } catch (error) {
    if (error instanceof ServiceActionNotAllowedError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof ServiceNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (error instanceof ServiceNameAlreadyExistsError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
