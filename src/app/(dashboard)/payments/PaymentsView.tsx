"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { SALE_PAYMENT_METHODS, type SalePaymentRow, type SalePaymentMethod } from "@/lib/sales/types";
import type { Role } from "@/lib/auth/roles";
import Pagination from "@/components/ui/Pagination";
import Avatar from "@/components/ui/Avatar";
import DateRangeFilter from "@/components/ui/DateRangeFilter";
import FilterDropdown from "@/components/ui/FilterDropdown";
import FilterBottomSheet from "@/components/ui/FilterBottomSheet";
import { useDebouncedValue } from "@/components/ui/useDebouncedValue";
import { useAutoRefresh } from "@/components/ui/useAutoRefresh";

const PAYMENT_METHOD_LABELS: Record<SalePaymentMethod, string> = {
  CASH: "Cash",
  CHEQUE: "Cheque",
  UPI: "UPI",
  BANK_TRANSFER: "Bank transfer",
  CARD: "Card",
  OTHER: "Other",
};

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

export default function PaymentsView({
  initialPayments,
  initialTotal,
  initialTotalPages,
  viewerRole,
}: {
  initialPayments: SalePaymentRow[];
  initialTotal: number;
  initialTotalPages: number;
  viewerRole: Role;
}) {
  const [payments, setPayments] = useState<SalePaymentRow[]>(initialPayments);
  const [total, setTotal] = useState(initialTotal);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState<SalePaymentMethod | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const activeFilterCount = [methodFilter, dateFrom, dateTo].filter(Boolean).length;

  // Filters are passed in explicitly rather than read off state: a setState
  // immediately followed by refetch() would still see the previous value and
  // send a request one change behind.
  async function refetch(overrides?: {
    search?: string;
    page?: number;
    method?: SalePaymentMethod | "";
    dateFrom?: string;
    dateTo?: string;
  }) {
    const effectiveSearch = overrides?.search ?? search;
    const effectiveMethod = overrides?.method ?? methodFilter;
    const effectiveFrom = overrides?.dateFrom ?? dateFrom;
    const effectiveTo = overrides?.dateTo ?? dateTo;
    const targetPage = overrides?.page ?? page;

    const params = new URLSearchParams();
    if (effectiveSearch.trim()) params.set("q", effectiveSearch.trim());
    if (effectiveMethod) params.set("method", effectiveMethod);
    if (effectiveFrom) params.set("dateFrom", effectiveFrom);
    if (effectiveTo) params.set("dateTo", effectiveTo);
    params.set("page", String(targetPage));

    setListError(null);
    try {
      const response = await fetch(`/api/payments?${params.toString()}`);
      if (!response.ok) {
        setListError("Could not load the payments list.");
        return;
      }
      const body = await response.json();
      setPayments(body.payments ?? []);
      setTotal(body.total ?? 0);
      setTotalPages(body.totalPages ?? 1);
      setPage(targetPage);
    } catch {
      setListError("Could not load the payments list.");
    }
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void refetch({ page: 1 });
  }

  const debouncedSearch = useDebouncedValue(search, 350);
  const lastSearch = useRef(debouncedSearch);
  useEffect(() => {
    if (lastSearch.current === debouncedSearch) return;
    lastSearch.current = debouncedSearch;
    void refetch({ search: debouncedSearch, page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useAutoRefresh(() => {
    void refetch();
  });

  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
        <span className="text-sm text-zinc-500">{total} payment{total === 1 ? "" : "s"}</span>
        <form onSubmit={handleSearchSubmit} className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
          <div className="relative max-w-xs">
            <i className="ri-search-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search payments…"
              aria-label="Search by company, payment number, or receipt number"
              className="w-full rounded-md border border-zinc-300 py-2 pr-3 pl-9 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </div>
        </form>

        {/* Desktop filters inline; on phones they collapse into the sheet below,
            same split as the leads list. */}
        <div className="hidden items-center gap-2.5 sm:flex">
          <FilterDropdown
            icon="ri-bank-card-line"
            ariaLabel="Filter by payment method"
            value={methodFilter}
            options={[
              { value: "", label: "All methods" },
              ...SALE_PAYMENT_METHODS.map((method) => ({
                value: method,
                label: PAYMENT_METHOD_LABELS[method],
              })),
            ]}
            onChange={(value) => {
              setMethodFilter(value);
              void refetch({ page: 1, method: value });
            }}
          />
          <DateRangeFilter
            from={dateFrom}
            to={dateTo}
            onChange={(from, to) => {
              setDateFrom(from);
              setDateTo(to);
              void refetch({ page: 1, dateFrom: from, dateTo: to });
            }}
          />
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setMethodFilter("");
                setDateFrom("");
                setDateTo("");
                void refetch({ page: 1, method: "", dateFrom: "", dateTo: "" });
              }}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              Clear
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setFilterSheetOpen(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 sm:hidden"
        >
          <i className="ri-filter-3-line text-brand-600" aria-hidden="true" />
          Filter
          {activeFilterCount > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
        {viewerRole !== "SUPER_ADMIN" && (
          <Link
            href="/payments/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            <i className="ri-add-line" aria-hidden="true" />
            New Payment
          </Link>
        )}
      </div>

      {listError && (
        <p role="alert" className="px-4 py-3 text-sm text-red-600">
          {listError}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="table-responsive w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-xs font-semibold text-zinc-500">
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Sale</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Sale amount / Due</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Receipt No.</th>
              <th className="px-4 py-3">Received by</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-zinc-500">
                  No payments recorded yet.
                </td>
              </tr>
            )}
            {payments.map((payment) => {
              const budget = Number(payment.budget_amount ?? 0);
              const paid = Number(payment.paid_amount ?? 0);
              const due = Math.max(budget - paid, 0);
              return (
                <tr key={payment.id} className="border-b border-zinc-100 transition-colors last:border-0 hover:bg-zinc-50/80">
                  <td data-label="Payment" className="px-4 py-3 font-medium text-zinc-900">{payment.payment_number}</td>
                  <td data-label="Sale" className="px-4 py-3">
                    <Link href={`/sales/${payment.sale_id}`} className="font-medium text-brand-700 hover:underline">
                      {payment.company_name}
                    </Link>
                    <p className="text-xs text-zinc-500">{payment.sale_number}</p>
                  </td>
                  <td data-label="Amount" className="px-4 py-3 font-medium text-emerald-700">{formatCurrency(Number(payment.amount))}</td>
                  <td data-label="Sale amount / Due" className="px-4 py-3">
                    <span className="text-zinc-900">{formatCurrency(budget)}</span>
                    <p className="text-xs text-amber-700">{formatCurrency(due)} due</p>
                  </td>
                  <td data-label="Method" className="px-4 py-3 text-zinc-700">
                    {PAYMENT_METHOD_LABELS[payment.payment_method]}
                    {payment.account_number && <p className="text-xs text-zinc-500">A/C {payment.account_number}</p>}
                  </td>
                  <td data-label="Receipt No." className="px-4 py-3 text-zinc-700">{payment.receipt_number ?? "—"}</td>
                  <td data-label="Received by" className="px-4 py-3">
                    {payment.recorded_by_name ? (
                      <span className="inline-flex items-center gap-2 text-zinc-700">
                        <Avatar name={payment.recorded_by_name} imageUrl={payment.recorded_by_avatar_url} />
                        {payment.recorded_by_name}
                      </span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td data-label="Date" className="px-4 py-3 text-zinc-700">{payment.payment_date}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} total={total} onChange={(nextPage) => refetch({ page: nextPage })} />

      <FilterBottomSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        onApply={() => {
          setFilterSheetOpen(false);
          void refetch({ page: 1 });
        }}
      >
        <FilterDropdown
          icon="ri-bank-card-line"
          ariaLabel="Filter by payment method"
          value={methodFilter}
          options={[
            { value: "", label: "All methods" },
            ...SALE_PAYMENT_METHODS.map((method) => ({
              value: method,
              label: PAYMENT_METHOD_LABELS[method],
            })),
          ]}
          onChange={setMethodFilter}
          fullWidth
        />
        <DateRangeFilter
          from={dateFrom}
          to={dateTo}
          onChange={(from, to) => {
            setDateFrom(from);
            setDateTo(to);
          }}
          inline
        />
      </FilterBottomSheet>
    </div>
  );
}
