import type { Pool } from "pg";
import { stripNul } from "@/lib/db";

export async function recordAuditLog(
  pool: Pool,
  entry: {
    actorUserId: number;
    action: string;
    targetTable?: string;
    targetId?: number;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO audit_logs (actor_user_id, action, target_table, target_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      entry.actorUserId,
      entry.action,
      entry.targetTable ?? null,
      entry.targetId ?? null,
      entry.details ? JSON.stringify(entry.details, (_key, value) => stripNul(value)) : null,
    ],
  );
}

// For the user-activity timeline: the action already succeeded, so a failed
// log write must not turn it into an error response.
export async function logActivity(pool: Pool, entry: Parameters<typeof recordAuditLog>[1]): Promise<void> {
  await recordAuditLog(pool, entry).catch((error) => console.error("activity log failed", entry.action, error));
}
