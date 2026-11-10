import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { SALE_BUDGET_TYPES, SALE_SOLD_BY_TYPES, SALE_PAYMENT_METHODS } from "@/lib/sales/types";
import { createSale } from "@/lib/sales/create";
import { listSalesPage } from "@/lib/sales/list";
import { parsePageParams } from "@/lib/pagination";
import { SaleActionNotAllowedError, SaleNotFoundError, SaleNotAccessibleError } from "@/lib/sales/errors";

const createSaleSchema = z.object({
  leadId: z.number().int().optional(),
  companyName: z.string().trim().min(1).optional(),
  contactPerson: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  address: z.string().trim().min(1).optional(),
  budgetAmount: z.number().positive(),
  budgetType: z.enum(SALE_BUDGET_TYPES),
  saleDate: z.string().trim().min(1).optional(),
  soldByType: z.enum(SALE_SOLD_BY_TYPES).optional(),
  soldByUserId: z.number().int().optional(),
  soldByCustomName: z.string().trim().min(1).optional(),
  serviceIds: z.array(z.number().int()).optional(),
  initialPaymentAmount: z.number().positive().optional(),
  initialPaymentMethod: z.enum(SALE_PAYMENT_METHODS).optional(),
  notes: z.string().trim().min(1).optional(),
});

const listQuerySchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  q: z.string().trim().min(1).optional(),
});

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSaleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const sale = await createSale(pool, {
      creatorId: user.id,
      creatorRole: user.role,
      ...parsed.data,
    });
    return NextResponse.json(sale, { status: 201 });
  } catch (error) {
    if (error instanceof SaleActionNotAllowedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof SaleNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (error instanceof SaleNotAccessibleError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw error;
  }
}

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = listQuerySchema.safeParse({
    dateFrom: url.searchParams.get("dateFrom") ?? undefined,
    dateTo: url.searchParams.get("dateTo") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const page = parsePageParams(url.searchParams);
  const result = await listSalesPage(pool, user, parsed.data, page);
  return NextResponse.json({ sales: result.items, page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages });
}
