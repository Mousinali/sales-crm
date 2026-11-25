import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { getCompany } from "@/lib/companies/get";
import { viewerScope } from "@/lib/companies/list";
import { archiveCompany, restoreCompany } from "@/lib/companies/archive";
import { CompanyNotFoundError, CompanyNameTakenError, InvalidCompanyNameError } from "@/lib/companies/errors";
import { updateCompany } from "@/lib/companies/update";
import { isValidPincode } from "@/lib/validation";

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

  const { name } = await params;

  try {
    const company = await getCompany(pool, name, viewerScope(user), { includeLeads: user.role !== "ACCOUNTANT" && user.role !== "HR", includeTransfers: user.role === "SUPER_ADMIN" });
    // An Accountant or HR sees the company's details and sales, never its leads.
    return NextResponse.json(user.role === "ACCOUNTANT" || user.role === "HR" ? { ...company, leads: [] } : company);
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
  if (user.role !== "SUPER_ADMIN") {
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
  if (user.role !== "SUPER_ADMIN") {
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

// Empty text clears a field; omitted fields are left alone.
const optionalText = z.string().trim().max(200).transform((v) => v || null).optional();
const editSchema = z.object({
  companyName: z.string().trim().min(1).max(200).optional(),
  industry: optionalText,
  businessType: optionalText,
  location: optionalText,
  address: optionalText,
  state: optionalText,
  pincode: z.string().trim().refine((v) => v === "" || isValidPincode(v)).transform((v) => v || null).optional(),
  country: optionalText,
  website: optionalText,
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.mustChangePassword || user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = editSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { name } = await params;
  try {
    const companyNameNormalized = await updateCompany(pool, user.id, name, parsed.data);
    return NextResponse.json({ ok: true, companyNameNormalized });
  } catch (error) {
    if (error instanceof CompanyNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (error instanceof CompanyNameTakenError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof InvalidCompanyNameError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
