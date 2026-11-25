"use client";

import DateField from "@/components/ui/DateField";
import { useDebouncedValue } from "@/components/ui/useDebouncedValue";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { parseErrorMessage } from "@/lib/parseErrorMessage";
import RefreshButton from "@/components/ui/RefreshButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { saleBalance } from "@/lib/sales/balance";
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

type EditLog = {
  id: number;
  action: string;
  target_id: number;
  payment_number: string | null;
  details: { amount: [string, string]; date: [string, string] };
  created_at: string;
  actor_name: string | null;
};

function LogItem({ log, saleNumber }: { log: EditLog; saleNumber: string }) {
  const isSale = log.action === "sale.update";
  const [oa, na] = log.details.amount;
  const [od, nd] = log.details.date;
  const rows = [
    Number(oa) !== Number(na) && { label: "Amount", from: formatCurrency(Number(oa)), to: formatCurrency(Number(na)) },
    od !== nd && { label: "Date", from: formatDate(od), to: formatDate(nd) },
  ].filter((r): r is { label: string; from: string; to: string } => Boolean(r));
  return (
    <li className="rounded-md border border-zinc-100 bg-zinc-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-900">
          <i className={isSale ? "ri-shopping-bag-line" : "ri-wallet-3-line"} aria-hidden="true" />
          {isSale ? `Sale ${saleNumber}` : `Payment ${log.payment_number ?? `#${log.target_id}`}`}
        </span>
        <span className="text-xs text-zinc-400">{new Date(log.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
      </div>
      <dl className="mt-2 flex flex-col gap-1 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-wrap items-center gap-x-2">
            <dt className="w-14 text-xs uppercase text-zinc-500">{r.label}</dt>
            <dd className="flex items-center gap-1.5">
              <span className="text-zinc-400 line-through">{r.from}</span>
              <i className="ri-arrow-right-line text-zinc-400" aria-hidden="true" />
              <span className="font-medium text-emerald-700">{r.to}</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-zinc-500">Edited by {log.actor_name ?? "Unknown"}</p>
    </li>
  );
}

export default function SaleDetailView({
  sale,
  services,
  initialPayments,
  soldByName,
  recordedByName,
  logs,
  relatedSales,
  userId,
}: {
  sale: SaleRow;
  services: ServiceRow[];
  initialPayments: SalePaymentRow[];
  soldByName: string | null;
  recordedByName: string | null;
  logs: EditLog[];
  relatedSales: SaleRow[];
  userId: number;
}) {
  const router = useRouter();
  const [payments, setPayments] = useState<SalePaymentRow[]>(initialPayments);
  // Re-sync when the server hands down fresh payments (e.g. after router.refresh()).
  const [syncedFrom, setSyncedFrom] = useState(initialPayments);
  if (syncedFrom !== initialPayments) {
    setSyncedFrom(initialPayments);
    setPayments(initialPayments);
  }
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

  const [logsOpen, setLogsOpen] = useState(false);
  const [logQuery, setLogQuery] = useState("");
  const [paymentQuery, setPaymentQuery] = useState("");
  const [tab, setTab] = useState<"payments" | "sales">("payments");
  const lq = logQuery.trim().toLowerCase();
  // The sale's own edits carry no payment number, so they match on the sale number.
  const filteredLogs = logs.filter((l) => !lq || (l.action === "sale.update" ? sale.sale_number : l.payment_number ?? "").toLowerCase().includes(lq));
  const pq = useDebouncedValue(paymentQuery, 250).trim().toLowerCase();
  const filteredSales = relatedSales.filter((s) =>
    !pq || [s.sale_number, s.contact_person, s.budget_type, s.sold_by_display_name, formatDate(s.sale_date)].some((v) => v?.toLowerCase().includes(pq)),
  );
  const filteredPayments = payments.filter((p) =>
    !pq || [p.payment_number, p.payment_method, p.receipt_number, p.account_number, p.notes, p.recorded_by_name, formatDate(p.payment_date)].some((v) => v?.toLowerCase().includes(pq)),
  );

  // Owner-only edit of the sale's (paymentId null) or a payment's amount and date.
  const [edit, setEdit] = useState<{ paymentId: number | null; amount: string; date: string } | null>(null);

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!edit) return;
    const value = Number(edit.amount);
    if (!Number.isFinite(value) || value <= 0 || !edit.date) {
      setFormError("Enter an amount greater than 0 and a date.");
      return;
    }
    setFormError(null);
    const url = edit.paymentId == null ? `/api/sales/${sale.id}` : `/api/sales/${sale.id}/payments/${edit.paymentId}`;
    const response = await fetch(url, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: value, date: edit.date }),
    });
    if (!response.ok) {
      setFormError(await parseErrorMessage(response, "Could not save the change.", { 403: "Only the user who added this can edit it." }));
      return;
    }
    toast.success("Saved");
    setEdit(null);
    router.refresh(); // re-reads the sale, payments and logs from the server
  }

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
  const { due: remaining, excess } = saleBalance(budgetAmount, paidAmount);

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
      // Re-read the list (rather than prepending the POST result) so the new row
      // carries who recorded it, and router.refresh() drops the cached copies of
      // the Payments/Sales lists, which would otherwise be up to 4 minutes stale.
      await refreshPayments();
      router.refresh();
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

  const percent = budgetAmount > 0 ? Math.round((paidAmount / budgetAmount) * 100) : 0;
  const status =
    paidAmount <= 0
      ? { label: "Unpaid", classes: "bg-rose-50 text-rose-700" }
      : excess > 0
        ? { label: "Overpaid", classes: "bg-violet-50 text-violet-700" }
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
                <span className="flex items-center gap-1.5"><i className="ri-user-line text-brand-600" aria-hidden="true" />{sale.contact_person}</span>
              )}
              {sale.phone && (
                <span className="flex items-center gap-1.5"><i className="ri-phone-line text-brand-600" aria-hidden="true" />{sale.phone}</span>
              )}
              {sale.email && (
                <span className="flex items-center gap-1.5"><i className="ri-mail-line text-brand-600" aria-hidden="true" />{sale.email}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <RefreshButton onRefresh={refreshPayments} />
            {sale.created_by === userId && (
              <button
                type="button"
                onClick={() => setEdit({ paymentId: null, amount: String(Number(sale.budget_amount)), date: String(sale.sale_date).slice(0, 10) })}
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                <i className="ri-edit-line" aria-hidden="true" />
                Edit sale
              </button>
            )}
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
            <div className={`h-full rounded-full transition-all ${excess > 0 ? "bg-violet-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(percent, 100)}%` }} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Budget" value={formatCurrency(budgetAmount)} icon="ri-money-rupee-circle-line" tone="brand" />
        <StatTile label="Paid so far" value={formatCurrency(paidAmount)} icon="ri-hand-coin-line" tone="emerald" />
        {excess > 0 ? (
          <StatTile label="Excess paid" value={formatCurrency(excess)} icon="ri-add-circle-line" tone="violet" />
        ) : (
          <StatTile label="Remaining" value={formatCurrency(remaining)} icon="ri-time-line" tone="amber" />
        )}
        <StatTile label="Payments" value={payments.length} icon="ri-receipt-line" tone="sky" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white xl:col-span-2">
          <div className="px-5 pt-4">
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-zinc-200">
            <div role="tablist" className="flex gap-5">
              {([["payments", "Payments", payments.length], ["sales", "Sales", relatedSales.length]] as const).map(([key, label, count]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => { setTab(key); setPaymentQuery(""); }}
                  className={`-mb-px inline-flex items-center gap-2 border-b-2 px-0.5 pb-3 pt-1 text-sm font-medium ${tab === key ? "border-brand-600 text-brand-700" : "border-transparent text-zinc-500 hover:text-zinc-800"}`}
                >
                  {label}
                  <span className={`rounded-full px-2 py-0.5 text-xs ${tab === key ? "bg-brand-50 text-brand-700" : "bg-zinc-100 text-zinc-600"}`}>{count}</span>
                </button>
              ))}
            </div>
            {(tab === "sales" ? relatedSales.length : payments.length) > 0 && (
              <div className="w-full pb-2.5 sm:w-64">
                <div className="relative">
                <i className="ri-search-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand-600" aria-hidden="true" />
                <input
                  type="search"
                  value={paymentQuery}
                  onChange={(event) => setPaymentQuery(event.target.value)}
                  placeholder="Search…"
                  aria-label="Search"
                  className="w-full rounded-md border border-zinc-300 py-2 pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
                </div>
              </div>
            )}
            </div>
          </div>
          {tab === "sales" ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="px-5 py-2">Sale ID</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Sold by</th>
                    <th className="px-3 py-2 text-right">Budget</th>
                    <th className="px-5 py-2 text-right">Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredSales.map((s) => (
                    <tr key={s.id} className={`hover:bg-zinc-50 ${s.id === sale.id ? "bg-brand-50/50" : ""}`}>
                      <td className="px-5 py-3 font-mono text-xs">
                        <Link href={`/sales/${s.id}`} className="font-medium text-brand-700 hover:underline">{s.sale_number}</Link>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-zinc-600">{formatDate(s.sale_date)}</td>
                      <td className="px-3 py-3 text-zinc-600">{BUDGET_TYPE_LABELS[s.budget_type]}</td>
                      <td className="px-3 py-3 text-zinc-600">{s.sold_by_display_name ?? "—"}</td>
                      <td className="px-3 py-3 text-right text-zinc-900">{formatCurrency(Number(s.budget_amount))}</td>
                      <td className="px-5 py-3 text-right font-semibold text-emerald-700">{formatCurrency(Number(s.paid_amount ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredSales.length === 0 && <p className="px-5 pb-6 pt-4 text-center text-sm text-zinc-500">No sales match your search.</p>}
            </div>
          ) : (
          <div className="mt-3 overflow-x-auto">
            {refreshing && payments.length === 0 ? (
              <div className="px-5 pb-5">
                <Skeleton className="h-24 w-full" />
              </div>
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
                    {payments.some((p) => p.recorded_by === userId) && <th className="px-3 py-2" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredPayments.map((p) => {
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
                        {p.recorded_by === userId ? (
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              aria-label="Edit payment"
                              onClick={() => setEdit({ paymentId: p.id, amount: String(Number(p.amount)), date: String(p.payment_date).slice(0, 10) })}
                              className="text-zinc-400 hover:text-brand-700"
                            >
                              <i className="ri-edit-line" aria-hidden="true" />
                            </button>
                          </td>
                        ) : payments.some((x) => x.recorded_by === userId) ? <td /> : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {payments.length > 0 && filteredPayments.length === 0 && (
              <p className="px-5 pb-6 pt-4 text-center text-sm text-zinc-500">No payments match your search.</p>
            )}
          </div>
          )}
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

          {logs.length > 0 && (
            <div className="rounded-lg border border-zinc-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-900">Edit log</h2>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">{logs.length}</span>
              </div>
              <ul className="mt-3 flex flex-col gap-3">
                {logs.slice(0, 2).map((l) => <LogItem key={l.id} log={l} saleNumber={sale.sale_number} />)}
              </ul>
              {logs.length > 2 && (
                <button type="button" onClick={() => setLogsOpen(true)} className="mt-3 text-sm font-medium text-brand-700 hover:underline">
                  See more ({logs.length - 2})
                </button>
              )}
            </div>
          )}

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

      {logsOpen && (
        <Modal title="Edit log" onClose={() => setLogsOpen(false)} maxWidth="max-w-xl">
          <input
            type="search"
            value={logQuery}
            onChange={(event) => setLogQuery(event.target.value)}
            placeholder="Search by payment no. or sale no."
            aria-label="Search edit log"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <ul className="mt-4 flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
            {filteredLogs.map((l) => <LogItem key={l.id} log={l} saleNumber={sale.sale_number} />)}
            {filteredLogs.length === 0 && <li className="py-6 text-center text-sm text-zinc-500">No matching edits.</li>}
          </ul>
        </Modal>
      )}

      {edit && (
        <Modal title={edit.paymentId == null ? "Edit sale" : "Edit payment"} onClose={() => setEdit(null)}>
          <form onSubmit={handleEditSubmit} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="editAmount" className="text-sm font-medium text-zinc-700">Amount</label>
              <MoneyInput
                id="editAmount"
                value={edit.amount}
                onValueChange={(amount) => setEdit({ ...edit, amount })}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="editDate" className="text-sm font-medium text-zinc-700">Date</label>
              <DateField id="editDate" value={edit.date} onChange={(date) => setEdit({ ...edit, date })} />
            </div>
            {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
            <div className="mt-2 flex justify-end gap-3">
              <button type="button" onClick={() => setEdit(null)} className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100">Cancel</button>
              <button type="submit" className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Save</button>
            </div>
          </form>
        </Modal>
      )}

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
