"use client";

// Builds the numbered-button sequence with "…" gaps once there are more
// pages than fit — always keeps the first, last, and a window around the
// current page, so the control doesn't grow unbounded on large lists.
function pageWindow(page: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  const sorted = Array.from(pages)
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);
  const result: (number | "ellipsis")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) result.push("ellipsis");
    result.push(p);
  });
  return result;
}

export default function Pagination({
  page,
  totalPages,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex flex-col items-stretch gap-3 border-t border-zinc-200 px-4 py-3 text-sm text-zinc-600 sm:flex-row sm:items-center sm:justify-between">
      {/* Grouped: "300000 total" is hard to read at a glance. */}
      <span className="text-center tabular-nums sm:text-left">{total.toLocaleString("en-IN")} total</span>
      <div className="flex items-center justify-between gap-1 sm:justify-start">
        <button
          type="button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 sm:h-8 sm:w-8 sm:rounded-md sm:border-0 sm:text-zinc-500"
        >
          <i className="ri-arrow-left-s-line" aria-hidden="true" />
        </button>
        {pageWindow(page, totalPages).map((entry, index) =>
          entry === "ellipsis" ? (
            <span key={`ellipsis-${index}`} className="hidden px-1 text-zinc-400 sm:inline">
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              aria-current={entry === page ? "page" : undefined}
              onClick={() => onChange(entry)}
              // min-w rather than a fixed w-8: a five-digit page number (300k
              // rows is 15,000 pages) overflowed the fixed pill and rendered
              // clipped. tabular-nums keeps the digits from jittering.
              className={`h-8 min-w-8 shrink-0 items-center justify-center rounded-md px-2 text-sm font-medium tabular-nums transition-colors ${
                entry === page ? "flex bg-brand-600 text-white" : "hidden text-zinc-700 hover:bg-zinc-100 sm:flex"
              }`}
            >
              {entry}
              {/* Phone shows just the current page + the total, not the number strip. */}
              {entry === page && <span className="ml-1 font-normal text-white/80 sm:hidden">of {totalPages.toLocaleString("en-IN")}</span>}
            </button>
          ),
        )}
        <button
          type="button"
          aria-label="Next page"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 sm:h-8 sm:w-8 sm:rounded-md sm:border-0 sm:text-zinc-500"
        >
          <i className="ri-arrow-right-s-line" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
