// SQL for "this user can see lead <alias>": they created it, own it, or an
// owner shared it with them. `param` is the placeholder (e.g. "$1") holding
// the user's id. Super Admin sees everything and doesn't use this. Shared by
// the lead list, the sales/payments lists and the company roll-up so a
// shared lead is visible — with its sales and payments — everywhere at once.
export function leadVisibleSql(alias: string, param: string): string {
  return `(${alias}.created_by = ${param} OR ${alias}.pre_sales_owner_id = ${param} OR ${alias}.salesperson_owner_id = ${param}
    OR EXISTS (SELECT 1 FROM lead_shares ls WHERE ls.lead_id = ${alias}.id AND ls.user_id = ${param}))`;
}
