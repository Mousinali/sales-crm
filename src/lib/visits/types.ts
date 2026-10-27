export const VISIT_STATUSES = ["SCHEDULED", "COMPLETED", "RESCHEDULED", "CANCELLED", "MISSED"] as const;
export type VisitStatus = typeof VISIT_STATUSES[number];

export type VisitRow = {
  id: number;
  lead_id: number;
  salesperson_id: number;
  visit_date: string;
  start_time: string;
  expected_duration_minutes: number | null;
  location: string | null;
  objective: string;
  preparation_notes: string | null;
  status: VisitStatus;
  outcome_notes: string | null;
  next_action: string | null;
  created_by: number;
  created_at: Date;
  updated_at: Date;
};
