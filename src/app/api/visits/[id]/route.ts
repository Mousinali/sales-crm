import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { rescheduleVisit, cancelVisit } from "@/lib/visits/schedule";
import { VisitActionNotAllowedError, VisitNotFoundError } from "@/lib/visits/errors";

const patchSchema = z.union([
  z.object({ action: z.literal("RESCHEDULE"), visitDate: z.string(), startTime: z.string() }),
  z.object({ action: z.literal("CANCEL") }),
]);

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
  const visitId = Number(id);
  if (!Number.isInteger(visitId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const visit =
      parsed.data.action === "RESCHEDULE"
        ? await rescheduleVisit(pool, { actorId: user.id, actorRole: user.role, visitId, visitDate: parsed.data.visitDate, startTime: parsed.data.startTime })
        : await cancelVisit(pool, { actorId: user.id, actorRole: user.role, visitId });
    return NextResponse.json(visit);
  } catch (error) {
    if (error instanceof VisitActionNotAllowedError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof VisitNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }
}
