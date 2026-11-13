import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { getCompany } from "@/lib/companies/get";
import { archiveCompany, restoreCompany } from "@/lib/companies/archive";
import { CompanyNotFoundError } from "@/lib/companies/errors";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (user.role !== "SUPER_ADMIN" && user.role !== "MARKETING_HEAD") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name } = await params;

  try {
    const company = await getCompany(pool, name);
    return NextResponse.json(company);
  } catch (error) {
    if (error instanceof CompanyNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (user.role !== "SUPER_ADMIN" && user.role !== "MARKETING_HEAD") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name } = await params;

  try {
    await archiveCompany(pool, user.id, name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof CompanyNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (user.role !== "SUPER_ADMIN" && user.role !== "MARKETING_HEAD") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name } = await params;

  try {
    await restoreCompany(pool, user.id, name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof CompanyNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }
}
