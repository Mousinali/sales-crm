import type { Pool } from "pg";
import type { Role } from "@/lib/auth/roles";
import { assertLeadVisible } from "@/lib/leads/guard";
import { recordLeadActivity } from "@/lib/leads/activities";
import { LeadNotFoundError, LeadNotAccessibleError } from "@/lib/leads/errors";
import { setSaleServices } from "./services";
import { insertSalePayment } from "./payments";
import { nextSaleNumber, financialYearCode } from "./saleNumber";
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
  // list) or are typed fresh. When a lead is chosen, its stored details are
  // the default, but any field the caller explicitly provides overrides
  // that default for this sale only (the lead record itself is untouched).
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
    companyName = input.companyName ?? lead.company_name;
    contactPerson = input.contactPerson ?? lead.contact_person;
    phone = input.phone ?? lead.phone;
    email = input.email ?? lead.email;
    address = input.address ?? lead.address;
  }
  if (!companyName?.trim()) {
    throw new SaleActionNotAllowedError("A company name or an existing lead is required");
  }

  // "Sold by" defaults to the person recording the sale, attributed under
  // their own role; any of the sale-creating roles can override it instead
  // (a custom name, or another active Pre-sales/Salesperson user).
  let soldByType: SaleSoldByType;
  let soldByUserId: number | null = null;
  let soldByCustomName: string | null = null;

  if (input.soldByType === undefined) {
    soldByType = input.creatorRole === "MARKETING_HEAD" ? "SELF" : input.creatorRole;
    soldByUserId = input.creatorId;
  } else {
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
  }

  // The sale number's sequence (per financial year) is read-then-written,
  // so it's generated and inserted inside one locked transaction to avoid
  // two concurrent sales landing on the same number.
  const saleDate = input.saleDate ? new Date(input.saleDate) : new Date();
  const client = await pool.connect();
  let sale: SaleRow;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`sale-number:${financialYearCode(saleDate)}`]);
    const saleNumber = await nextSaleNumber(client, saleDate);

    const { rows } = await client.query<SaleRow>(
      `INSERT INTO sales (
         sale_number, lead_id, company_name, contact_person, phone, email, address,
         budget_amount, budget_type, sale_date,
         sold_by_type, sold_by_user_id, sold_by_custom_name, notes, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, CURRENT_DATE), $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        saleNumber,
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
    sale = rows[0];
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

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
