"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { parseErrorMessage } from "@/lib/parseErrorMessage";
import { SALE_PAYMENT_METHODS, type SalePaymentMethod } from "@/lib/sales/types";

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

type SimpleSale = { id: number; company_name: string; sale_number: string; budget_amount: string; paid_amount?: string };

function todayDateInput(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

export default function NewPaymentForm() {
  const router = useRouter();

  const [saleOptions, setSaleOptions] = useState<SimpleSale[]>([]);
  const [saleId, setSaleId] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod>("CASH");
  const [paymentDate, setPaymentDate] = useState(todayDateInput());
  const [receiptNumber, setReceiptNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [notes, setNotes] = useState("");

  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    // shortcut: a flat page of up to 100 sales, no search box; fine for a
    // small-to-mid sales list — switch to a type-ahead search if it grows.
    fetch("/api/sales?pageSize=100")
      .then((res) => (res.ok ? res.json() : { sales: [] }))
      .then((body) => setSaleOptions(body.sales ?? []))
      .catch(() => {});
  }, []);

  const selectedSale = saleOptions.find((s) => String(s.id) === saleId);
  const due = selectedSale ? Math.max(Number(selectedSale.budget_amount) - Number(selectedSale.paid_amount ?? 0), 0) : null;

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!saleId) {
      setCreateError("Choose a sale to record this payment against.");
      return;
    }
    const value = Number(amount);
    if (!amount.trim() || !Number.isFinite(value) || value <= 0) {
      setCreateError("Enter an amount greater than 0.");
      return;
    }

    setCreateError(null);
    setCreating(true);

    try {
      const response = await fetch(`/api/sales/${saleId}/payments`, {
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
        setCreateError(message);
        toast.error("Could not record payment", message);
        setCreating(false);
        return;
      }

      await response.json();
      toast.success("Payment recorded", selectedSale?.company_name);
      router.push("/payments");
    } catch {
      setCreateError("Could not record the payment.");
      toast.error("Could not record payment");
      setCreating(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6">
      <form onSubmit={handleCreateSubmit} className="grid grid-cols-3 gap-4" noValidate>
        <div className="col-span-3 flex flex-col gap-1.5">
          <label htmlFor="saleId" className="text-sm font-medium text-zinc-700">
            Sale
          </label>
          <select
            id="saleId"
            value={saleId}
            onChange={(event) => setSaleId(event.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            <option value="">Select a sale…</option>
            {saleOptions.map((sale) => (
              <option key={sale.id} value={sale.id}>
                {sale.sale_number} · {sale.company_name}
              </option>
            ))}
          </select>
          {due !== null && <p className="text-xs text-amber-700">{formatCurrency(due)} due on this sale</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="amount" className="text-sm font-medium text-zinc-700">
            Amount
          </label>
          <input
            id="amount"
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="paymentMethod" className="text-sm font-medium text-zinc-700">
            Payment method
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

        <div className="flex flex-col gap-1.5">
          <label htmlFor="receiptNumber" className="text-sm font-medium text-zinc-700">
            Receipt No.
          </label>
          <input
            id="receiptNumber"
            type="text"
            value={receiptNumber}
            onChange={(event) => setReceiptNumber(event.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>

        {METHODS_WITH_ACCOUNT_NUMBER.includes(paymentMethod) && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="accountNumber" className="text-sm font-medium text-zinc-700">
              Account number
            </label>
            <input
              id="accountNumber"
              type="text"
              value={accountNumber}
              onChange={(event) => setAccountNumber(event.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
        )}

        <div className="col-span-3 flex flex-col gap-1.5">
          <label htmlFor="notes" className="text-sm font-medium text-zinc-700">
            Notes
          </label>
          <input
            id="notes"
            type="text"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>

        {createError && (
          <p role="alert" className="col-span-3 text-sm text-red-600">
            {createError}
          </p>
        )}

        <div className="col-span-3 mt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push("/payments")}
            className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={creating}
            className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
