// Deleting a company archives its leads (companies/archive.ts) but leaves the
// sales & payments rows intact. These subqueries let the dashboard money
// figures exclude a deleted company's sales/payments by filtering (not
// deleting) them, so restoring the company brings its figures back untouched.
//
// Exclude (NOT IN) rather than include (IN active): a custom sale has no
// lead_id, so an "IN active-company" test would wrongly drop it — an
// exclusion of archived-company sale ids keeps every no-company sale.
export const ARCHIVED_COMPANY_SALE_IDS =
  "SELECT id FROM sales WHERE lead_id IN (SELECT id FROM leads WHERE archived_at IS NOT NULL)";
