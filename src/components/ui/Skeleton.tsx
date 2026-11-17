// Loading placeholders shared by every route's loading.tsx and by client
// components that fetch after mount. Compose these instead of hand-rolling
// grey blocks, so every loading state looks and animates the same way.

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-zinc-200/70 ${className}`} />;
}

// Mirrors PageHeading: title line + breadcrumb line.
export function SkeletonHeading() {
  return (
    <div className="mb-6 flex flex-col gap-2">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-3.5 w-28" />
    </div>
  );
}

// Mirrors a row of StatTile cards.
export function SkeletonStatTiles({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <Skeleton className="h-7 w-24" />
              <Skeleton className="mt-2 h-3 w-16" />
            </div>
            <Skeleton className="h-9 w-9 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

// A bordered card holding a title line and a block (a chart, a list, …).
export function SkeletonCard({ height = "h-48", title = true }: { height?: string; title?: boolean }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      {title && <Skeleton className="mb-4 h-4 w-36" />}
      <Skeleton className={`w-full ${height}`} />
    </div>
  );
}

// Just the <tr>s, to drop into a table's own <tbody> while its data loads.
export function SkeletonTableRows({ rows = 6, cols }: { rows?: number; cols: number }) {
  return Array.from({ length: rows }, (_, r) => (
    <tr key={r}>
      {Array.from({ length: cols }, (_, c) => (
        <td key={c} className="px-3 py-3">
          <Skeleton className={`h-4 ${c === 0 ? "w-8" : c === 1 ? "w-40" : "w-20"}`} />
        </td>
      ))}
    </tr>
  ));
}

// A whole table card: a filter bar, a header row and rows.
export function SkeletonTable({ rows = 8, cols = 5, filters = true }: { rows?: number; cols?: number; filters?: boolean }) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
      {filters && (
        <div className="flex flex-wrap items-center gap-3 border-b border-zinc-200 p-4">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
        </div>
      )}
      <table className="w-full">
        <thead className="border-b border-zinc-200 bg-zinc-50">
          <tr>
            {Array.from({ length: cols }, (_, c) => (
              <th key={c} className="px-3 py-3">
                <Skeleton className="h-3 w-16" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          <SkeletonTableRows rows={rows} cols={cols} />
        </tbody>
      </table>
    </div>
  );
}

// A ranked list (best clients, top employees): rank, two text lines, an amount.
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <ul className="flex flex-col divide-y divide-zinc-100">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-3 py-2.5">
          <Skeleton className="h-4 w-4" />
          <div className="flex-1">
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="mt-1.5 h-3 w-28" />
          </div>
          <div className="flex flex-col items-end">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="mt-1.5 h-3 w-14" />
          </div>
        </li>
      ))}
    </ul>
  );
}

type Variant = "table" | "dashboard" | "detail" | "calendar" | "chat" | "form";

// A whole-page placeholder for loading.tsx files — pick the variant closest
// to the page's layout.
export function SkeletonPage({ variant = "table" }: { variant?: Variant }) {
  return (
    <div role="status" aria-busy="true" aria-label="Loading">
      <span className="sr-only">Loading…</span>
      <SkeletonHeading />
      {variant === "table" && <SkeletonTable />}
      {variant === "dashboard" && (
        <div className="flex flex-col gap-6">
          <SkeletonStatTiles />
          <SkeletonCard height="h-64" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      )}
      {variant === "detail" && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="mt-3 h-6 w-64 max-w-full" />
            <Skeleton className="mt-3 h-4 w-80 max-w-full" />
          </div>
          <SkeletonStatTiles />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <SkeletonTable rows={4} cols={5} filters={false} />
            </div>
            <SkeletonCard height="h-56" />
          </div>
        </div>
      )}
      {variant === "calendar" && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <Skeleton className="mb-4 h-6 w-40" />
          <div className="grid grid-cols-7 gap-px">
            {Array.from({ length: 35 }, (_, i) => (
              <Skeleton key={i} className="h-20 rounded-none" />
            ))}
          </div>
        </div>
      )}
      {variant === "chat" && (
        <div className="grid h-96 grid-cols-3 gap-4">
          <SkeletonCard height="h-80" />
          <div className="col-span-2">
            <SkeletonCard height="h-80" />
          </div>
        </div>
      )}
      {variant === "form" && (
        <div className="max-w-2xl rounded-lg border border-zinc-200 bg-white p-6">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="mb-5">
              <Skeleton className="mb-2 h-3.5 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
          <Skeleton className="h-10 w-28" />
        </div>
      )}
    </div>
  );
}
