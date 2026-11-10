import type { Pool } from "pg";
import type { Role } from "@/lib/auth/roles";
import { assertLeadVisible } from "@/lib/leads/guard";
import { recordLeadActivity } from "@/lib/leads/activities";
import { LeadNotFoundError, LeadNotAccessibleError } from "@/lib/leads/errors";
import { setSaleServices } from "./services";
import { insertSalePayment } from "./payments";
import { SaleActionNotAllowedError, SaleNotFoundError, SaleNotAccessibleError } from "./errors";
import type { SaleRow, SaleBudgetType, SaleSoldByType, SalePaymentMethod } from "./types";

export async function createSale(pool: Pool, input: {
  creatorId: number;
  creatorRole: Role;
  leadId?: number;
  companyName?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  budgetAmount: number;
  budgetType: SaleBudgetType;
  saleDate?: string;
  soldByType?: SaleSoldByType;
  soldByUserId?: number;
  soldByCustomName?: string;
  serviceIds?: number[];
  // An advance/first payment taken at the moment the sale is recorded —
  // optional, since not every sale is paid anything up front.
  initialPaymentAmount?: number;
  initialPaymentMethod?: SalePaymentMethod;
  notes?: string;
}): Promise<SaleRow> {
  if (input.creatorRole !== "MARKETING_HEAD" && input.creatorRole !== "PRE_SALES" && input.creatorRole !== "SALESPERSON") {
    throw new SaleActionNotAllowedError(`${input.creatorRole} cannot record sales`);
  }

  // Company details either come from an existing lead (chosen from the lead
  // list) or are typed fresh — never both, so the sale always has one clear
  // source of truth for who the client is.
  let companyName = input.companyName;
  let contactPerson = input.contactPerson ?? null;
  let phone = input.phone ?? null;
  let email = input.email ?? null;
  let address = input.address ?? null;

  if (input.leadId != null) {
    const lead = await assertLeadVisible(pool, { id: input.creatorId, role: input.creatorRole }, input.leadId).catch((error) => {
      if (error instanceof LeadNotFoundError) throw new SaleNotFoundError(error.message);
      if (error instanceof LeadNotAccessibleError) throw new SaleNotAccessibleError(error.message);
      throw error;
    });
    if (lead.status === "REJECTED" || lead.status === "CLOSED_LOST") {
      throw new SaleActionNotAllowedError(`Lead ${input.leadId} is ${lead.status} and cannot be recorded as a sale`);
    }
    companyName = lead.company_name;
    contactPerson = lead.contact_person;
    phone = lead.phone;
    email = lead.email;
    address = lead.address;
  }
  if (!companyName?.trim()) {
    throw new SaleActionNotAllowedError("A company name or an existing lead is required");
  }

  // Only a Marketing Head can credit a sale to someone else; a Pre-sales or
  // Salesperson recording their own sale is always the one who sold it.
  let soldByType: SaleSoldByType;
  let soldByUserId: number | null = null;
  let soldByCustomName: string | null = null;

  if (input.creatorRole === "MARKETING_HEAD") {
    if (!input.soldByType) {
      throw new SaleActionNotAllowedError("soldByType is required");
    }
    soldByType = input.soldByType;
    if (soldByType === "SELF") {
      soldByUserId = input.creatorId;
    } else if (soldByType === "CUSTOM") {
      if (!input.soldByCustomName?.trim()) {
        throw new SaleActionNotAllowedError("soldByCustomName is required when soldByType is CUSTOM");
      }
      soldByCustomName = input.soldByCustomName.trim();
    } else {
      if (!input.soldByUserId) {
        throw new SaleActionNotAllowedError(`soldByUserId is required when soldByType is ${soldByType}`);
      }
      const { rows } = await pool.query<{ role: Role; status: "ACTIVE" | "INACTIVE" }>(
        "SELECT role, status FROM users WHERE id = $1",
        [input.soldByUserId],
      );
      const target = rows[0];
      if (!target || target.status !== "ACTIVE" || target.role !== soldByType) {
        throw new SaleActionNotAllowedError(`No active ${soldByType} user with id ${input.soldByUserId}`);
      }
      soldByUserId = input.soldByUserId;
    }
  } else {
    soldByType = input.creatorRole;
    soldByUserId = input.creatorId;
  }

  const { rows } = await pool.query<SaleRow>(
    `INSERT INTO sales (
       lead_id, company_name, contact_person, phone, email, address,
       budget_amount, budget_type, sale_date,
       sold_by_type, sold_by_user_id, sold_by_custom_name, notes, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, CURRENT_DATE), $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      input.leadId ?? null,
      companyName,
      contactPerson,
      phone,
      email,
      address,
      input.budgetAmount,
      input.budgetType,
      input.saleDate ?? null,
      soldByType,
      soldByUserId,
      soldByCustomName,
      input.notes ?? null,
      input.creatorId,
    ],
  );
  const sale = rows[0];

  if (input.serviceIds && input.serviceIds.length > 0) {
    await setSaleServices(pool, { saleId: sale.id, serviceIds: input.serviceIds });
  }

  if (input.initialPaymentAmount && input.initialPaymentAmount > 0) {
    if (!input.initialPaymentMethod) {
      throw new SaleActionNotAllowedError("initialPaymentMethod is required when recording an initial payment");
    }
    await insertSalePayment(pool, {
      saleId: sale.id,
      amount: input.initialPaymentAmount,
      paymentMethod: input.initialPaymentMethod,
      paymentDate: input.saleDate,
      notes: "Initial payment",
      recordedBy: input.creatorId,
    });
  }

  if (input.leadId != null) {
    await pool.query("UPDATE leads SET status = 'CLOSED_WON', updated_at = now() WHERE id = $1", [input.leadId]);
    await recordLeadActivity(pool, {
      leadId: input.leadId,
      actorId: input.creatorId,
      type: "STATUS_CHANGE",
      notes: `Converted to sale #${sale.id}`,
    });
  }

  return sale;
}
