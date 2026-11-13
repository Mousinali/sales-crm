export const SALE_BUDGET_TYPES = ["ONE_TIME", "MONTHLY", "PART_PAYMENT", "ADVANCE"] as const;
export type SaleBudgetType = typeof SALE_BUDGET_TYPES[number];

export const SALE_SOLD_BY_TYPES = ["SELF", "CUSTOM", "PRE_SALES", "SALESPERSON"] as const;
export type SaleSoldByType = typeof SALE_SOLD_BY_TYPES[number];

export const SALE_PAYMENT_METHODS = ["CASH", "CHEQUE", "UPI", "BANK_TRANSFER", "CARD", "OTHER"] as const;
export type SalePaymentMethod = typeof SALE_PAYMENT_METHODS[number];

export type SaleRow = {
  id: number;
  sale_number: string;
  lead_id: number | null;
  company_name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  budget_amount: string;
  budget_type: SaleBudgetType;
  sale_date: string;
  sold_by_type: SaleSoldByType;
  sold_by_user_id: number | null;
  sold_by_custom_name: string | null;
  notes: string | null;
  created_by: number;
  created_at: Date;
  updated_at: Date;
  // Only present on rows from listSales/listSalesPage (joined in there) —
  // the display name for sold_by_type, resolved from users.name for
  // PRE_SALES/SALESPERSON/SELF or sold_by_custom_name for CUSTOM.
  sold_by_display_name?: string | null;
  sold_by_avatar_url?: string | null;
  // Only present where joined in (listSales/listSalesPage, getSale) — the
  // running total of sale_payments for this sale, so paid/remaining can be
  // shown without a second round trip.
  paid_amount?: string;
};

export type SalePaymentRow = {
  id: number;
  payment_number: string;
  sale_id: number;
  amount: string;
  payment_method: SalePaymentMethod;
  payment_date: string;
  receipt_number: string | null;
  account_number: string | null;
  notes: string | null;
  recorded_by: number;
  created_at: Date;
  // Only present on rows from listSalePayments (joined in there) — who
  // recorded it, for the sale detail page's timeline.
  recorded_by_name?: string;
  recorded_by_avatar_url?: string | null;
  // Only present on rows from listPaymentsPage (joined in there) — the
  // sale's own identity/amounts, so the all-payments list doesn't need a
  // second round trip per row.
  sale_number?: string;
  company_name?: string;
  budget_amount?: string;
  paid_amount?: string;
};
