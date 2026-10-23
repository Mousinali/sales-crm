export const ROLES = ["SUPER_ADMIN", "MARKETING_HEAD", "PRE_SALES", "SALESPERSON"] as const;
export type Role = typeof ROLES[number];

const MANAGEABLE_ROLES: Record<Role, readonly Role[]> = {
  SUPER_ADMIN: ["MARKETING_HEAD"],
  MARKETING_HEAD: ["PRE_SALES", "SALESPERSON"],
  PRE_SALES: [],
  SALESPERSON: [],
};

export function creatableRolesFor(viewerRole: Role): readonly Role[] {
  return MANAGEABLE_ROLES[viewerRole];
}

export function canManage(viewerRole: Role, targetRole: Role): boolean {
  return MANAGEABLE_ROLES[viewerRole].includes(targetRole);
}
