// Groups the audit `action` keys into the few filters a person actually
// thinks in. Patterns are SQL LIKE patterns matched against `action`.
export const AUDIT_CATEGORIES = [
  { key: "sign_in", label: "Sign-ins", patterns: ["user.login", "user.logout", "user.password_changed"] },
  { key: "leads", label: "Leads", patterns: ["lead.%", "company.%"] },
  { key: "sales", label: "Sales & payments", patterns: ["sale.%", "payment.%", "sale_payment.%"] },
  { key: "schedule", label: "Calendar & tasks", patterns: ["calendar.%", "task.%", "visit.%"] },
  { key: "teams", label: "Teams & email", patterns: ["team.%", "email.%"] },
  { key: "accounts", label: "Accounts", patterns: ["user.created", "user.updated", "user.activated", "user.deactivated", "user.access_reset", "user.archived", "user.restored", "service.%"] },
] as const;

export type AuditCategoryKey = (typeof AUDIT_CATEGORIES)[number]["key"];
export const AUDIT_CATEGORY_KEYS = AUDIT_CATEGORIES.map((c) => c.key) as [AuditCategoryKey, ...AuditCategoryKey[]];
export const AUDIT_PERIODS = ["today", "7d", "30d"] as const;
export type AuditPeriod = (typeof AUDIT_PERIODS)[number];

export function categoryOfAction(action: string): AuditCategoryKey | null {
  for (const c of AUDIT_CATEGORIES) {
    for (const pattern of c.patterns) {
      if (pattern.endsWith("%") ? action.startsWith(pattern.slice(0, -1)) : action === pattern) return c.key;
    }
  }
  return null;
}
