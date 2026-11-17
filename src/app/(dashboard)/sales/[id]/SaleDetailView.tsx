"use client";

import DateField from "@/components/ui/DateField";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "@/lib/toast";
import { parseErrorMessage } from "@/lib/parseErrorMessage";
import RefreshButton from "@/components/ui/RefreshButton";
import StatTile from "@/components/ui/StatTile";
import Modal from "@/components/ui/Modal";
import { FormattedText } from "@/components/ui/RichTextField";
import MoneyInput from "@/components/ui/MoneyInput";
import CustomSelect from "@/components/ui/CustomSelect";
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

function formatDate(date: string | Date): string {
  const [y, m, d] = typeof date === "string" ? date.slice(0, 10).split("-").map(Number) : [date.getFullYear(), date.getMonth() + 1, date.getDate()];
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
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
  soldByName,
  recordedByName,
}: {
  sale: SaleRow;
  services: ServiceRow[];
  initialPayments: SalePaymentRow[];
  soldByName: string | null;
  recordedByName: string | null;
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

  const percent = budgetAmount > 0 ? Math.min(100, Math.round((paidAmount / budgetAmount) * 100)) : 0;
  const status =
    paidAmount <= 0
      ? { label: "Unpaid", classes: "bg-rose-50 text-rose-700" }
      : remaining > 0
        ? { label: "Partially paid", classes: "bg-amber-50 text-amber-700" }
        : { label: "Paid in full", classes: "bg-emerald-50 text-emerald-700" };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-xs font-medium text-zinc-600">{sale.sale_number}</span>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${status.classes}`}>{status.label}</span>
              <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700">{BUDGET_TYPE_LABELS[sale.budget_type]}</span>
            </div>
            <h1 className="mt-2 text-xl font-semibold text-zinc-900">
              {sale.lead_id ? (
                <Link href={`/leads/${sale.lead_id}`} className="hover:text-brand-700 hover:underline">
                  {sale.company_name}
                </Link>
              ) : (
                sale.company_name
              )}
            </h1>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-zinc-500">
              {sale.contact_person && (
                <span className="flex items-center gap-1.5"><i className="ri-user-line" aria-hidden="true" />{sale.contact_person}</span>
              )}
              {sale.phone && (
                <span className="flex items-center gap-1.5"><i className="ri-phone-line" aria-hidden="true" />{sale.phone}</span>
              )}
              {sale.email && (
                <span className="flex items-center gap-1.5"><i className="ri-mail-line" aria-hidden="true" />{sale.email}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <RefreshButton onRefresh={refreshPayments} />
            <button
              type="button"
              onClick={openPaymentModal}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2"
            >
              <i className="ri-add-line" aria-hidden="true" />
              Add payment
            </button>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-1.5 flex items-baseline justify-between text-xs text-zinc-500">
            <span>Payment progress</span>
            <span className="font-medium text-zinc-700">{percent}% collected</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-amber-100">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Budget" value={formatCurrency(budgetAmount)} icon="ri-money-rupee-circle-line" tone="brand" />
        <StatTile label="Paid so far" value={formatCurrency(paidAmount)} icon="ri-hand-coin-line" tone="emerald" />
        <StatTile label="Remaining" value={formatCurrency(Math.max(remaining, 0))} icon="ri-time-line" tone="amber" />
        <StatTile label="Payments" value={payments.length} icon="ri-receipt-line" tone="sky" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white xl:col-span-2">
          <div className="px-5 pt-4">
            <h2 className="text-sm font-semibold text-zinc-900">Payment history</h2>
            <p className="mt-0.5 text-xs text-zinc-500">{payments.length} payment{payments.length === 1 ? "" : "s"} recorded</p>
          </div>
          <div className="mt-3 overflow-x-auto">
            {refreshing && payments.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-zinc-500">Loading…</p>
            ) : payments.length === 0 ? (
              <div className="px-5 pb-8 pt-4 text-center">
                <i className="ri-wallet-3-line text-3xl text-zinc-300" aria-hidden="true" />
                <p className="mt-1 text-sm text-zinc-500">No payments recorded yet.</p>
                <button type="button" onClick={openPaymentModal} className="mt-2 text-sm font-medium text-brand-700 hover:underline">
                  Add the first payment
                </button>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="px-5 py-2">Date</th>
                    <th className="px-3 py-2">Payment no.</th>
                    <th className="px-3 py-2">Method</th>
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2">Recorded by</th>
                    <th className="px-5 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {payments.map((p) => {
                    const method = PAYMENT_METHOD_DISPLAY[p.payment_method];
                    const reference = [p.receipt_number && `Receipt ${p.receipt_number}`, p.account_number && `A/C ${p.account_number}`].filter(Boolean).join(" · ");
                    return (
                      <tr key={p.id} className="align-top hover:bg-zinc-50">
                        <td className="whitespace-nowrap px-5 py-3 text-zinc-600">{formatDate(p.payment_date)}</td>
                        <td className="px-3 py-3 font-mono text-xs text-zinc-600">{p.payment_number}</td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">
                            <i className={method.icon} aria-hidden="true" />
                            {method.label}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-zinc-600">
                          {reference || "—"}
                          {p.notes && <p className="text-xs text-zinc-400">{p.notes}</p>}
                        </td>
                        <td className="px-3 py-3 text-zinc-600">{p.recorded_by_name ?? "—"}</td>
                        <td className="px-5 py-3 text-right font-semibold text-emerald-700">{formatCurrency(Number(p.amount))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-zinc-900">Sale details</h2>
            <dl className="mt-3 flex flex-col gap-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Sale date</dt>
                <dd className="font-medium text-zinc-900">{formatDate(sale.sale_date)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Sold by</dt>
                <dd className="font-medium text-zinc-900">{soldByName ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Recorded by</dt>
                <dd className="font-medium text-zinc-900">{recordedByName ?? "—"}</dd>
              </div>
              {sale.address && (
                <div>
                  <dt className="text-zinc-500">Address</dt>
                  <dd className="mt-0.5 text-zinc-900">{sale.address}</dd>
                </div>
              )}
            </dl>
          </div>

          {services.length > 0 && (
            <div className="rounded-lg border border-zinc-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-zinc-900">Services</h2>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {services.map((s) => (
                  <span key={s.id} className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {sale.notes && (
            <div className="rounded-lg border border-zinc-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-zinc-900">Notes</h2>
              <div className="mt-2 text-sm text-zinc-700">
                <FormattedText text={sale.notes} />
              </div>
            </div>
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
              <MoneyInput
                id="paymentAmount"
                value={amount}
                onValueChange={setAmount}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="paymentMethod" className="text-sm font-medium text-zinc-700">
                  Method
                </label>
                <CustomSelect
                  id="paymentMethod"
                  value={paymentMethod}
                  onChange={(value) => setPaymentMethod(value as SalePaymentMethod)}
                  options={SALE_PAYMENT_METHODS.map((method) => ({
                    value: method,
                    label: PAYMENT_METHOD_LABELS[method],
                  }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="paymentDate" className="text-sm font-medium text-zinc-700">
                  Date
                </label>
                <DateField id="paymentDate" value={paymentDate} onChange={setPaymentDate} />
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
