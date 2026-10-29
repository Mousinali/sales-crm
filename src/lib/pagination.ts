export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export type PageParams = { page: number; pageSize: number };

export type PagedResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function parsePageParams(searchParams: URLSearchParams): PageParams {
  const page = Math.max(1, Math.trunc(Number(searchParams.get("page"))) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(Number(searchParams.get("pageSize"))) || DEFAULT_PAGE_SIZE));
  return { page, pageSize };
}

/**
 * Turns rows carrying a `count(*) OVER()` window-count column (aliased
 * `total_count` — append `, count(*) OVER() AS total_count` to the SELECT
 * list and `LIMIT $n OFFSET $m` to the query) into a `PagedResult`. One
 * round trip gets both the page of rows and the total match count, instead
 * of a separate `SELECT count(*)` query.
 */
export function toPagedResult<T extends { total_count: number }>(
  rows: T[],
  params: PageParams,
): PagedResult<Omit<T, "total_count">> {
  const total = rows[0]?.total_count ?? 0;
  const items = rows.map((row) => {
    const item: Record<string, unknown> = { ...row };
    delete item.total_count;
    return item as Omit<T, "total_count">;
  });
  return {
    items,
    page: params.page,
    pageSize: params.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}
