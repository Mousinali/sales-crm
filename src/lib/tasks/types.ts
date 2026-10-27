import type { LeadPriority } from "@/lib/leads/types";

export const TASK_STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type TaskStatus = typeof TASK_STATUSES[number];

export type TaskPriority = LeadPriority;

export type TaskRow = {
  id: number;
  lead_id: number | null;
  assigned_user_id: number;
  title: string;
  description: string | null;
  due_at: Date;
  priority: TaskPriority;
  status: TaskStatus;
  created_by: number;
  created_at: Date;
  completed_at: Date | null;
};
