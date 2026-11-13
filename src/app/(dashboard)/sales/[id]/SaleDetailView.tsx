"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "@/lib/toast";
import { parseErrorMessage } from "@/lib/parseErrorMessage";
import RefreshButton from "@/components/ui/RefreshButton";
import Timeline, { type TimelineEntry } from "@/components/ui/Timeline";
import Modal from "@/components/ui/Modal";
import { FormattedText } from "@/components/ui/RichTextField";
import { SALE_PAYMENT_METHODS, type SaleRow, type SalePaymentRow, type SaleBudgetType, type SalePaymentMethod } from "@/lib/sales/types";
import type { ServiceRow } from "@/lib/services/types";

const BUDGET_TYPE_LABELS: Record<SaleBudgetType, string> = {
  ONE_TIME: "One time",
  MONTHLY: "Monthly",
  PART_PAYMENT: "Part payment",
  ADVANCE: "Advance",
};

const PAYMENT_METHOD_DISPLAY: Record<SalePaymentMethod, { label: string; icon: string }> = {
  CASH: { label: "Cash", icon: "ri-cash-line" },
  CHEQUE: { label: "Cheque", icon: "ri-file-paper-2-line" },
  UPI: { label: "UPI", icon: "ri-smartphone-line" },
  BANK_TRANSFER: { label: "Bank transfer", icon: "ri-bank-line" },
  CARD: { label: "Card", icon: "ri-bank-card-2-line" },
  OTHER: { label: "Other", icon: "ri-more-line" },
};
const PAYMENT_METHOD_LABELS: Record<SalePaymentMethod, string> = {
  CASH: "Cash",
  CHEQUE: "Cheque",
  UPI: "UPI",
  BANK_TRANSFER: "Bank transfer",
  CARD: "Card",
  OTHER: "Other",
};

// Only these methods are tied to a bank account, so only they prompt for one.
const METHODS_WITH_ACCOUNT_NUMBER: SalePaymentMethod[] = ["BANK_TRANSFER", "CHEQUE"];

function paymentsToTimeline(payments: SalePaymentRow[]): TimelineEntry[] {
  return payments.map((p) => ({
    id: p.id,
    icon: PAYMENT_METHOD_DISPLAY[p.payment_method].icon,
    iconClass: "bg-emerald-50 text-emerald-600",
    title: `${formatCurrency(Number(p.amount))} · ${PAYMENT_METHOD_DISPLAY[p.payment_method].label}`,
    description: [p.payment_number, p.account_number && `A/C ${p.account_number}`, p.receipt_number && `Receipt ${p.receipt_number}`, p.notes]
      .filter(Boolean)
      .join(" · "),
    meta: p.recorded_by_name ? `Recorded by ${p.recorded_by_name}` : undefined,
    timestamp: p.payment_date,
    dateOnly: true,
  }));
}

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

function todayDateInput(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function SaleDetailView({
  sale,
  services,
  initialPayments,
}: {
  sale: SaleRow;
  services: ServiceRow[];
  initialPayments: SalePaymentRow[];
}) {
  const [payments, setPayments] = useState<SalePaymentRow[]>(initialPayments);
  const [refreshing, setRefreshing] = useState(false);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod>("CASH");
  const [paymentDate, setPaymentDate] = useState(todayDateInput());
  const [receiptNumber, setReceiptNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function openPaymentModal() {
    setAmount("");
    setPaymentMethod("CASH");
    setPaymentDate(todayDateInput());
    setReceiptNumber("");
    setAccountNumber("");
    setNotes("");
    setFormError(null);
    setPaymentModalOpen(true);
  }

  const budgetAmount = Number(sale.budget_amount);
  const paidAmount = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const remaining = budgetAmount - paidAmount;

  async function refreshPayments() {
    setRefreshing(true);
    try {
      const response = await fetch(`/api/sales/${sale.id}/payments`);
      if (response.ok) {
        const body = await response.json();
        setPayments(body.payments ?? []);
      }
    } finally {
      setRefreshing(false);
    }
  }

  async function handlePaymentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(amount);
    if (!amount.trim() || !Number.isFinite(value) || value <= 0) {
      setFormError("Enter an amount greater than 0.");
      return;
    }

    setFormError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/sales/${sale.id}/payments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amount: value,
          paymentMethod,
          paymentDate: paymentDate || undefined,
          receiptNumber: receiptNumber.trim() || undefined,
          accountNumber: METHODS_WITH_ACCOUNT_NUMBER.includes(paymentMethod) ? accountNumber.trim() || undefined : undefined,
          notes: notes.trim() || undefined,
        }),
      });
      if (!response.ok) {
        const message = await parseErrorMessage(response, "Could not record the payment.", {
          403: "You are not allowed to do that.",
        });
        setFormError(message);
        toast.error("Could not record payment", message);
        setSubmitting(false);
        return;
      }
      const created = await response.json();
      setPayments((current) => [created, ...current]);
      setAmount("");
      setReceiptNumber("");
      setAccountNumber("");
      setNotes("");
      toast.success("Payment recorded", formatCurrency(value));
      setSubmitting(false);
      setPaymentModalOpen(false);
    } catch {
      setFormError("Could not record the payment.");
      toast.error("Could not record payment");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-zinc-400">{sale.sale_number}</p>
            <h1 className="text-lg font-semibold text-zinc-900">
              {sale.lead_id ? (
                <Link href={`/leads/${sale.lead_id}`} className="text-indigo-700 hover:underline">
                  {sale.company_name}
                </Link>
              ) : (
                sale.company_name
              )}
            </h1>
            {sale.contact_person && <p className="text-sm text-zinc-500">{sale.contact_person}</p>}
            <p className="mt-1 text-sm text-zinc-500">
              {sale.phone} {sale.email && `· ${sale.email}`}
            </p>
          </div>
          <RefreshButton onRefresh={refreshPayments} />
        </div>

        {services.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {services.map((s) => (
              <span key={s.id} className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                {s.name}
              </span>
            ))}
          </div>
        )}

        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs font-medium uppercase text-zinc-500">Budget</dt>
            <dd className="mt-1 text-lg font-semibold text-zinc-900">{formatCurrency(budgetAmount)}</dd>
            <dd className="text-xs text-zinc-500">{BUDGET_TYPE_LABELS[sale.budget_type]}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-zinc-500">Paid so far</dt>
            <dd className="mt-1 text-lg font-semibold text-emerald-700">{formatCurrency(paidAmount)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-zinc-500">Remaining</dt>
            <dd className={`mt-1 text-lg font-semibold ${remaining > 0 ? "text-amber-700" : "text-zinc-900"}`}>{formatCurrency(Math.max(remaining, 0))}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-zinc-500">Sold by</dt>
            <dd className="mt-1 text-sm text-zinc-900">
              {sale.sold_by_type === "CUSTOM" ? sale.sold_by_custom_name : sale.sold_by_display_name ?? "—"}
            </dd>
          </div>
        </dl>

        {sale.notes && (
          <div className="mt-4">
            <dt className="text-xs font-medium uppercase text-zinc-500">Notes</dt>
            <dd className="mt-1 text-sm text-zinc-700">
              <FormattedText text={sale.notes} />
            </dd>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Transaction timeline</h2>
            <p className="mt-1 text-xs text-zinc-500">{payments.length} payment{payments.length === 1 ? "" : "s"} recorded</p>
          </div>
          <button
            type="button"
            onClick={openPaymentModal}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <i className="ri-add-line" aria-hidden="true" />
            Add payment
          </button>
        </div>

        <div className="mt-4">
          {refreshing && payments.length === 0 ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : (
            <Timeline entries={paymentsToTimeline(payments)} emptyText="No payments recorded yet." />
          )}
        </div>
      </div>

      {paymentModalOpen && (
        <Modal title="Add payment" onClose={() => setPaymentModalOpen(false)}>
          <form onSubmit={handlePaymentSubmit} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="paymentAmount" className="text-sm font-medium text-zinc-700">
                Amount
              </label>
              <input
                id="paymentAmount"
                type="number"
                min="0"
                step="any"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="paymentMethod" className="text-sm font-medium text-zinc-700">
                  Method
                </label>
                <select
                  id="paymentMethod"
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value as SalePaymentMethod)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  {SALE_PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {PAYMENT_METHOD_LABELS[method]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="paymentDate" className="text-sm font-medium text-zinc-700">
                  Date
                </label>
                <input
                  id="paymentDate"
                  type="date"
                  value={paymentDate}
                  onChange={(event) => setPaymentDate(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="paymentReceiptNumber" className="text-sm font-medium text-zinc-700">
                  Receipt No.
                </label>
                <input
                  id="paymentReceiptNumber"
                  type="text"
                  value={receiptNumber}
                  onChange={(event) => setReceiptNumber(event.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              {METHODS_WITH_ACCOUNT_NUMBER.includes(paymentMethod) && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="paymentAccountNumber" className="text-sm font-medium text-zinc-700">
                    Account number
                  </label>
                  <input
                    id="paymentAccountNumber"
                    type="text"
                    value={accountNumber}
                    onChange={(event) => setAccountNumber(event.target.value)}
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="paymentNotes" className="text-sm font-medium text-zinc-700">
                Notes
              </label>
              <input
                id="paymentNotes"
                type="text"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            {formError && (
              <p role="alert" className="text-sm text-red-600">
                {formError}
              </p>
            )}
            <div className="mt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPaymentModalOpen(false)}
                className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Add payment
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
