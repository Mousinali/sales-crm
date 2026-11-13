import type { PoolClient } from "pg";
import { nextSequenceNumber } from "./sequenceNumber";

export async function nextPaymentNumber(client: PoolClient, date: Date): Promise<string> {
  return nextSequenceNumber(client, "sale_payments", "payment_number", "PY", date);
}
