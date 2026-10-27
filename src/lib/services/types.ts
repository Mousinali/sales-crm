export const SERVICE_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type ServiceStatus = typeof SERVICE_STATUSES[number];

export type ServiceRow = {
  id: number;
  name: string;
  description: string | null;
  status: ServiceStatus;
  created_at: Date;
  updated_at: Date;
};
