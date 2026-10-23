export const ROLES = ["SUPER_ADMIN", "MARKETING_HEAD", "PRE_SALES", "SALESPERSON"] as const;
export type Role = typeof ROLES[number];
