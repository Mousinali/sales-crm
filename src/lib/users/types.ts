import type { Role } from "@/lib/auth/roles";

export type UserRow = {
  id: number;
  role: Role;
  name: string;
  email: string;
  status: "ACTIVE" | "INACTIVE";
  employee_id: string | null;
  phone: string | null;
  whatsapp_number: string | null;
  designation: string | null;
  avatar_url: string | null;
  archived_at: Date | null;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
};
