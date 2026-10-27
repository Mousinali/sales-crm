import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { SERVICE_STATUSES } from "@/lib/services/types";
import { listServices } from "@/lib/services/list";
import { createService } from "@/lib/services/create";
import { ServiceActionNotAllowedError, ServiceNameAlreadyExistsError } from "@/lib/services/errors";

const createServiceSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
});

const listQuerySchema = z.object({
  status: z.enum(SERVICE_STATUSES).optional(),
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
  const parsed = listQuerySchema.safeParse({ status: url.searchParams.get("status") ?? undefined });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  // Everyone can see the active list (they need it to pick services on a
  // lead); only a Super Admin can ask for inactive ones too, to manage them.
  const status = parsed.data.status ?? (user.role === "SUPER_ADMIN" ? undefined : "ACTIVE");
  const services = await listServices(pool, status ? { status } : undefined);
  return NextResponse.json({ services });
}

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createServiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const service = await createService(pool, { actorId: user.id, actorRole: user.role, ...parsed.data });
    return NextResponse.json(service, { status: 201 });
  } catch (error) {
    if (error instanceof ServiceActionNotAllowedError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof ServiceNameAlreadyExistsError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
