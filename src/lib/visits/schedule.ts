import type { Pool } from "pg";
import type { Role } from "@/lib/auth/roles";
import { assertLeadVisible } from "@/lib/leads/guard";
import { recordLeadActivity } from "@/lib/leads/activities";
import { recordNotification } from "@/lib/notifications/record";
import { VisitActionNotAllowedError, VisitNotFoundError, VisitNotAccessibleError, VisitConflictError } from "./errors";
import type { VisitRow } from "./types";

async function getVisitOrThrow(pool: Pool, visitId: number): Promise<VisitRow> {
  const { rows } = await pool.query<VisitRow>("SELECT * FROM client_visits WHERE id = $1", [visitId]);
  const visit = rows[0];
  if (!visit) {
    throw new VisitNotFoundError(`No visit with id ${visitId}`);
  }
  return visit;
}

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
    confirmConflict?: boolean;
  },
): Promise<VisitRow> {
  if (input.actorRole !== "MARKETING_HEAD") {
    throw new VisitActionNotAllowedError(`${input.actorRole} cannot schedule visits`);
  }

  await assertLeadVisible(pool, { id: input.actorId, role: input.actorRole }, input.leadId);
  await assertActiveSalesperson(pool, input.salespersonId);

  // The conflict check and the insert below are not atomic on their own —
  // two concurrent schedule calls for the same salesperson/slot can both
  // pass the check before either commits. An advisory lock scoped to this
  // transaction and keyed by the slot serializes the two callers so the
  // second one's check runs only after the first has committed.
  const client = await pool.connect();
  let visit: VisitRow;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `visit:${input.salespersonId}:${input.visitDate}:${input.startTime}`,
    ]);

    if (!input.confirmConflict) {
      const { rows: conflictRows } = await client.query<VisitRow>(
        `SELECT * FROM client_visits
         WHERE salesperson_id = $1 AND visit_date = $2 AND start_time = $3 AND status IN ('SCHEDULED', 'RESCHEDULED')
         LIMIT 1`,
        [input.salespersonId, input.visitDate, input.startTime],
      );
      if (conflictRows[0]) {
        throw new VisitConflictError(
          `Salesperson ${input.salespersonId} already has a visit at ${input.visitDate} ${input.startTime}`,
        );
      }
    }

    const { rows } = await client.query<VisitRow>(
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
    visit = rows[0];
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

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

export async function rescheduleVisit(
  pool: Pool,
  input: {
    actorId: number;
    actorRole: Role;
    visitId: number;
    visitDate: string;
    startTime: string;
    confirmConflict?: boolean;
  },
): Promise<VisitRow> {
  if (input.actorRole !== "MARKETING_HEAD") {
    throw new VisitActionNotAllowedError(`${input.actorRole} cannot reschedule visits`);
  }
  const visit = await getVisitOrThrow(pool, input.visitId);
  if (visit.status !== "SCHEDULED" && visit.status !== "RESCHEDULED") {
    throw new VisitActionNotAllowedError(`Visit ${input.visitId} is ${visit.status} and cannot be rescheduled`);
  }
  await assertActiveSalesperson(pool, visit.salesperson_id);

  // Same TOCTOU hazard as scheduleVisit: serialize concurrent reschedules
  // onto the same destination slot with an advisory lock.
  const client = await pool.connect();
  let updated: VisitRow;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `visit:${visit.salesperson_id}:${input.visitDate}:${input.startTime}`,
    ]);

    if (!input.confirmConflict) {
      const { rows: conflictRows } = await client.query<VisitRow>(
        `SELECT * FROM client_visits
         WHERE salesperson_id = $1 AND visit_date = $2 AND start_time = $3 AND status IN ('SCHEDULED', 'RESCHEDULED')
         LIMIT 1`,
        [visit.salesperson_id, input.visitDate, input.startTime],
      );
      if (conflictRows[0]) {
        throw new VisitConflictError(
          `Salesperson ${visit.salesperson_id} already has a visit at ${input.visitDate} ${input.startTime}`,
        );
      }
    }

    const { rows } = await client.query<VisitRow>(
      `UPDATE client_visits
       SET status = 'RESCHEDULED', visit_date = $1, start_time = $2, updated_at = now()
       WHERE id = $3 AND status IN ('SCHEDULED', 'RESCHEDULED')
       RETURNING *`,
      [input.visitDate, input.startTime, input.visitId],
    );
    if (rows.length === 0) {
      throw new VisitActionNotAllowedError(`Visit ${input.visitId} is no longer SCHEDULED or RESCHEDULED`);
    }
    updated = rows[0];
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  await recordLeadActivity(pool, {
    leadId: visit.lead_id,
    actorId: input.actorId,
    type: "CLIENT_VISIT",
    notes: `Rescheduled to ${input.visitDate} ${input.startTime}`,
  });
  await recordNotification(pool, {
    recipientUserId: visit.salesperson_id,
    type: "VISIT_RESCHEDULED",
    leadId: visit.lead_id,
    message: `Your client visit was rescheduled to ${input.visitDate} ${input.startTime}`,
  });

  return updated;
}

export async function cancelVisit(
  pool: Pool,
  input: { actorId: number; actorRole: Role; visitId: number },
): Promise<VisitRow> {
  if (input.actorRole !== "MARKETING_HEAD") {
    throw new VisitActionNotAllowedError(`${input.actorRole} cannot cancel visits`);
  }
  const visit = await getVisitOrThrow(pool, input.visitId);
  if (visit.status !== "SCHEDULED" && visit.status !== "RESCHEDULED") {
    throw new VisitActionNotAllowedError(`Visit ${input.visitId} is ${visit.status} and cannot be cancelled`);
  }

  const { rows } = await pool.query<VisitRow>(
    `UPDATE client_visits
     SET status = 'CANCELLED', updated_at = now()
     WHERE id = $1 AND status IN ('SCHEDULED', 'RESCHEDULED')
     RETURNING *`,
    [input.visitId],
  );
  if (rows.length === 0) {
    throw new VisitActionNotAllowedError(`Visit ${input.visitId} is no longer SCHEDULED or RESCHEDULED`);
  }
  const updated = rows[0];

  await recordLeadActivity(pool, {
    leadId: visit.lead_id,
    actorId: input.actorId,
    type: "CLIENT_VISIT",
    notes: "Visit cancelled",
  });
  await recordNotification(pool, {
    recipientUserId: visit.salesperson_id,
    type: "VISIT_CANCELLED",
    leadId: visit.lead_id,
    message: "Your client visit was cancelled",
  });

  return updated;
}

export async function recordVisitOutcome(
  pool: Pool,
  input: {
    actorId: number;
    actorRole: Role;
    visitId: number;
    outcome: "COMPLETED" | "MISSED";
    outcomeNotes?: string;
    nextAction?: string;
  },
): Promise<VisitRow> {
  if (input.actorRole !== "SALESPERSON") {
    throw new VisitActionNotAllowedError(`${input.actorRole} cannot record a visit outcome`);
  }
  const visit = await getVisitOrThrow(pool, input.visitId);
  if (visit.salesperson_id !== input.actorId) {
    throw new VisitNotAccessibleError(`Salesperson ${input.actorId} cannot access visit ${input.visitId}`);
  }
  if (visit.status !== "SCHEDULED" && visit.status !== "RESCHEDULED") {
    throw new VisitActionNotAllowedError(`Visit ${input.visitId} is ${visit.status} and cannot have an outcome recorded`);
  }

  const { rows } = await pool.query<VisitRow>(
    `UPDATE client_visits
     SET status = $1, outcome_notes = $2, next_action = $3, updated_at = now()
     WHERE id = $4 AND status IN ('SCHEDULED', 'RESCHEDULED')
     RETURNING *`,
    [input.outcome, input.outcomeNotes ?? null, input.nextAction ?? null, input.visitId],
  );
  if (rows.length === 0) {
    throw new VisitActionNotAllowedError(`Visit ${input.visitId} is no longer SCHEDULED or RESCHEDULED`);
  }
  return rows[0];
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
