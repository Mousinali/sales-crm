import type { PoolClient } from "pg";
import { financialYearCode, nextSequenceNumber } from "./sequenceNumber";

export { financialYearCode };

export async function nextSaleNumber(client: PoolClient, date: Date): Promise<string> {
  return nextSequenceNumber(client, "sales", "sale_number", "TS", date);
}
