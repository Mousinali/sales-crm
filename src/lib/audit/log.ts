import type { Pool } from "pg";

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
      entry.details ? JSON.stringify(entry.details) : null,
    ],
  );
}
