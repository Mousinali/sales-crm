"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { SALE_BUDGET_TYPES, type SaleRow, type SaleBudgetType } from "@/lib/sales/types";
import type { Role } from "@/lib/auth/roles";
import Pagination from "@/components/ui/Pagination";
import Avatar from "@/components/ui/Avatar";
import DateRangeFilter from "@/components/ui/DateRangeFilter";
import FilterDropdown from "@/components/ui/FilterDropdown";
import FilterBottomSheet from "@/components/ui/FilterBottomSheet";
import { useDebouncedValue } from "@/components/ui/useDebouncedValue";
import { useAutoRefresh } from "@/components/ui/useAutoRefresh";

const BUDGET_TYPE_LABELS: Record<SaleBudgetType, string> = {
  ONE_TIME: "One time",
  MONTHLY: "Monthly",
  PART_PAYMENT: "Part payment",
  ADVANCE: "Advance",
};

export default function SalesView({
  initialSales,
  initialTotal,
  initialTotalPages,
  viewerRole,
}: {
  initialSales: SaleRow[];
  initialTotal: number;
  initialTotalPages: number;
  viewerRole: Role;
}) {
  const [sales, setSales] = useState<SaleRow[]>(initialSales);
  const [total, setTotal] = useState(initialTotal);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [budgetTypeFilter, setBudgetTypeFilter] = useState<SaleBudgetType | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const activeFilterCount = [budgetTypeFilter, dateFrom, dateTo].filter(Boolean).length;

  // Filters are passed in explicitly rather than read off state: a setState
  // immediately followed by refetch() would still see the previous value and
  // send a request one change behind.
  async function refetch(overrides?: {
    search?: string;
    page?: number;
    budgetType?: SaleBudgetType | "";
    dateFrom?: string;
    dateTo?: string;
  }) {
    const effectiveSearch = overrides?.search ?? search;
    const effectiveBudgetType = overrides?.budgetType ?? budgetTypeFilter;
    const effectiveFrom = overrides?.dateFrom ?? dateFrom;
    const effectiveTo = overrides?.dateTo ?? dateTo;
    const targetPage = overrides?.page ?? page;

    const params = new URLSearchParams();
    if (effectiveSearch.trim()) params.set("q", effectiveSearch.trim());
    if (effectiveBudgetType) params.set("budgetType", effectiveBudgetType);
    if (effectiveFrom) params.set("dateFrom", effectiveFrom);
    if (effectiveTo) params.set("dateTo", effectiveTo);
    params.set("page", String(targetPage));

    setListError(null);
    try {
      const response = await fetch(`/api/sales?${params.toString()}`);
      if (!response.ok) {
        setListError("Could not load the sales list.");
        return;
      }
      const body = await response.json();
      setSales(body.sales ?? []);
      setTotal(body.total ?? 0);
      setTotalPages(body.totalPages ?? 1);
      setPage(targetPage);
    } catch {
      setListError("Could not load the sales list.");
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
        <span className="text-sm text-zinc-500">{total} sale{total === 1 ? "" : "s"}</span>
        <form onSubmit={handleSearchSubmit} className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
          <div className="relative max-w-xs">
            <i className="ri-search-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search sales…"
              aria-label="Search by company, sale number, or contact person"
              className="w-full rounded-md border border-zinc-300 py-2 pr-3 pl-9 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </div>
        </form>

        {/* Desktop filters inline; on phones they collapse into the sheet below,
            same split as the leads list. */}
        <div className="hidden items-center gap-2.5 sm:flex">
          <FilterDropdown
            icon="ri-price-tag-3-line"
            ariaLabel="Filter by budget type"
            value={budgetTypeFilter}
            options={[
              { value: "", label: "All budget types" },
              ...SALE_BUDGET_TYPES.map((type) => ({
                value: type,
                label: BUDGET_TYPE_LABELS[type],
              })),
            ]}
            onChange={(value) => {
              setBudgetTypeFilter(value);
              void refetch({ page: 1, budgetType: value });
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
                setBudgetTypeFilter("");
                setDateFrom("");
                setDateTo("");
                void refetch({ page: 1, budgetType: "", dateFrom: "", dateTo: "" });
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
            href="/sales/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            <i className="ri-add-line" aria-hidden="true" />
            Add Sale
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
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Budget</th>
              <th className="px-4 py-3">Paid / Remaining</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Sold by</th>
            </tr>
          </thead>
          <tbody>
            {sales.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                  No sales recorded yet.
                </td>
              </tr>
            )}
            {sales.map((sale) => {
              const budget = Number(sale.budget_amount);
              const paid = Number(sale.paid_amount ?? 0);
              const remaining = Math.max(budget - paid, 0);
              return (
                <tr key={sale.id} className="border-b border-zinc-100 transition-colors last:border-0 hover:bg-zinc-50/80">
                  <td data-label="Company" className="px-4 py-3">
                    <Link href={`/sales/${sale.id}`} className="font-medium text-brand-700 hover:underline">
                      {sale.company_name}
                    </Link>
                    <p className="text-xs text-zinc-500">{sale.sale_number}{sale.contact_person ? ` · ${sale.contact_person}` : ""}</p>
                  </td>
                  <td data-label="Budget" className="px-4 py-3">
                    <span className="font-medium text-zinc-900">₹{budget.toLocaleString("en-IN")}</span>
                    <p className="text-xs text-zinc-500">{BUDGET_TYPE_LABELS[sale.budget_type]}</p>
                  </td>
                  <td data-label="Paid / Remaining" className="px-4 py-3">
                    <span className="font-medium text-emerald-700">₹{paid.toLocaleString("en-IN")}</span>
                    <p className="text-xs text-amber-700">₹{remaining.toLocaleString("en-IN")} remaining</p>
                  </td>
                  <td data-label="Date" className="px-4 py-3 text-zinc-700">{sale.sale_date}</td>
                  <td data-label="Sold by" className="px-4 py-3">
                    {sale.sold_by_display_name ? (
                      <span className="inline-flex items-center gap-2 text-zinc-700">
                        <Avatar name={sale.sold_by_display_name} imageUrl={sale.sold_by_avatar_url} />
                        {sale.sold_by_display_name}
                      </span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
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
          icon="ri-price-tag-3-line"
          ariaLabel="Filter by budget type"
          value={budgetTypeFilter}
          options={[
            { value: "", label: "All budget types" },
            ...SALE_BUDGET_TYPES.map((type) => ({
              value: type,
              label: BUDGET_TYPE_LABELS[type],
            })),
          ]}
          onChange={setBudgetTypeFilter}
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
