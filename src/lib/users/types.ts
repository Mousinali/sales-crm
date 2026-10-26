import type { Role } from "@/lib/auth/roles";

export type UserRow = {
  id: number;
  role: Role;
  name: string;
  email: string;
  status: "ACTIVE" | "INACTIVE";
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
};
