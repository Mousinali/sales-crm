import type { Pool } from "pg";
import type { Role } from "@/lib/auth/roles";
import { assertLeadVisible } from "@/lib/leads/guard";
import { recordLeadActivity } from "@/lib/leads/activities";
import { recordNotification } from "@/lib/notifications/record";
import { VisitActionNotAllowedError } from "./errors";
import type { VisitRow } from "./types";

async function assertActiveSalesperson(pool: Pool, userId: number): Promise<void> {
  const { rows } = await pool.query<{ role: Role; status: "ACTIVE" | "INACTIVE" }>(
    "SELECT role, status FROM users WHERE id = $1",
    [userId],
  );
  const target = rows[0];
  if (!target || target.status !== "ACTIVE" || target.role !== "SALESPERSON") {
    throw new VisitActionNotAllowedError(`User ${userId} is not an active SALESPERSON`);
  }
}

export async function scheduleVisit(
  pool: Pool,
  input: {
    actorId: number;
    actorRole: Role;
    leadId: number;
    salespersonId: number;
    visitDate: string;
    startTime: string;
    expectedDurationMinutes?: number;
    location?: string;
    objective: string;
    preparationNotes?: string;
  },
): Promise<VisitRow> {
  if (input.actorRole !== "MARKETING_HEAD") {
    throw new VisitActionNotAllowedError(`${input.actorRole} cannot schedule visits`);
  }

  await assertLeadVisible(pool, { id: input.actorId, role: input.actorRole }, input.leadId);
  await assertActiveSalesperson(pool, input.salespersonId);

  const { rows } = await pool.query<VisitRow>(
    `INSERT INTO client_visits
       (lead_id, salesperson_id, visit_date, start_time, expected_duration_minutes, location, objective, preparation_notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      input.leadId,
      input.salespersonId,
      input.visitDate,
      input.startTime,
      input.expectedDurationMinutes ?? null,
      input.location ?? null,
      input.objective,
      input.preparationNotes ?? null,
      input.actorId,
    ],
  );
  const visit = rows[0];

  await recordLeadActivity(pool, {
    leadId: input.leadId,
    actorId: input.actorId,
    type: "CLIENT_VISIT",
    notes: input.objective,
  });
  await recordNotification(pool, {
    recipientUserId: input.salespersonId,
    type: "VISIT_SCHEDULED",
    leadId: input.leadId,
    message: `A client visit was scheduled for you on ${input.visitDate} ${input.startTime}`,
  });

  return visit;
}

export async function findConflictingVisit(
  pool: Pool,
  input: { salespersonId: number; visitDate: string; startTime: string },
): Promise<VisitRow | null> {
  const { rows } = await pool.query<VisitRow>(
    `SELECT * FROM client_visits
     WHERE salesperson_id = $1 AND visit_date = $2 AND start_time = $3 AND status IN ('SCHEDULED', 'RESCHEDULED')
     LIMIT 1`,
    [input.salespersonId, input.visitDate, input.startTime],
  );
  return rows[0] ?? null;
}
