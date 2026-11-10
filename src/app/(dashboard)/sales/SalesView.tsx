"use client";

import { useState } from "react";
import Link from "next/link";
import type { SaleRow, SaleBudgetType } from "@/lib/sales/types";
import Pagination from "@/components/ui/Pagination";
import Avatar from "@/components/ui/Avatar";
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
}: {
  initialSales: SaleRow[];
  initialTotal: number;
  initialTotalPages: number;
}) {
  const [sales, setSales] = useState<SaleRow[]>(initialSales);
  const [total, setTotal] = useState(initialTotal);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [page, setPage] = useState(1);
  const [listError, setListError] = useState<string | null>(null);

  async function refetch(targetPage: number) {
    setListError(null);
    try {
      const response = await fetch(`/api/sales?page=${targetPage}`);
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

  useAutoRefresh(() => {
    void refetch(page);
  });

  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <span className="text-sm text-zinc-500">{total} sale{total === 1 ? "" : "s"}</span>
        <Link
          href="/sales/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          <i className="ri-add-line" aria-hidden="true" />
          Add Sale
        </Link>
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
                    {sale.contact_person && <p className="text-xs text-zinc-500">{sale.contact_person}</p>}
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
                        <Avatar name={sale.sold_by_display_name} />
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

      <Pagination page={page} totalPages={totalPages} total={total} onChange={refetch} />
    </div>
  );
}
