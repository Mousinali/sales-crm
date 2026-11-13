/**
 * Seeds demo sales + payments so the list filters have something to bite on:
 * dates spread across two years, every budget type, every payment method.
 *
 * Run: npm run seed:demo        (add -- --force to seed a second batch)
 * Undo: every row it writes is tagged `seed:demo` in notes — the script prints
 * the exact DELETE on completion.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

// Dynamic imports, like seed-super-admin.ts: static `import` is hoisted above
// config(), so the pool would read DATABASE_URL before .env.local is loaded.
const { pool } = await import("../src/lib/db");
const { createSale } = await import("../src/lib/sales/create");
const { recordSalePayment } = await import("../src/lib/sales/payments");

import type { Role } from "@/lib/auth/roles";
import type { SaleBudgetType, SalePaymentMethod } from "@/lib/sales/types";

const TAG = "seed:demo";

type Creator = { id: number; role: Role; name: string };

const SALES: {
  company: string;
  contact: string;
  amount: number;
  budgetType: SaleBudgetType;
  saleDate: string;
  // Days after the sale date, and the method, for each payment on it.
  payments: { afterDays: number; amount: number; method: SalePaymentMethod; receipt?: string }[];
}[] = [
  { company: "Orchid Interiors", contact: "Ananya Bose", amount: 48000, budgetType: "ONE_TIME", saleDate: "2025-11-05",
    payments: [{ afterDays: 2, amount: 48000, method: "BANK_TRANSFER", receipt: "RCPT-1001" }] },
  { company: "Northwind Logistics", contact: "Rahul Mehta", amount: 120000, budgetType: "PART_PAYMENT", saleDate: "2026-01-15",
    payments: [{ afterDays: 1, amount: 40000, method: "CHEQUE", receipt: "RCPT-1002" }, { afterDays: 45, amount: 35000, method: "UPI" }] },
  { company: "Saffron Foods", contact: "Priya Nair", amount: 26000, budgetType: "MONTHLY", saleDate: "2026-02-28",
    payments: [{ afterDays: 3, amount: 13000, method: "CASH" }] },
  { company: "Vertex Dental Care", contact: "Dr. Imran Shaikh", amount: 75000, budgetType: "ADVANCE", saleDate: "2026-03-10",
    payments: [{ afterDays: 0, amount: 25000, method: "CARD", receipt: "RCPT-1003" }, { afterDays: 30, amount: 25000, method: "UPI" }] },
  { company: "Bluepeak Realty", contact: "Sneha Kulkarni", amount: 310000, budgetType: "PART_PAYMENT", saleDate: "2026-04-22",
    payments: [{ afterDays: 5, amount: 100000, method: "BANK_TRANSFER", receipt: "RCPT-1004" }] },
  { company: "Kestrel Fitness", contact: "Arjun Rao", amount: 54000, budgetType: "MONTHLY", saleDate: "2026-05-30",
    payments: [{ afterDays: 2, amount: 9000, method: "UPI" }, { afterDays: 33, amount: 9000, method: "UPI" }] },
  { company: "Lumen Electricals", contact: "Farah Khan", amount: 88000, budgetType: "ONE_TIME", saleDate: "2026-06-18",
    payments: [{ afterDays: 7, amount: 88000, method: "OTHER", receipt: "RCPT-1005" }] },
  { company: "Tamarind Travels", contact: "Vikram Desai", amount: 142000, budgetType: "ADVANCE", saleDate: "2026-07-09",
    payments: [{ afterDays: 0, amount: 50000, method: "CASH", receipt: "RCPT-1006" }] },
  { company: "Quartz Analytics", contact: "Meera Iyer", amount: 265000, budgetType: "PART_PAYMENT", saleDate: "2026-08-14",
    payments: [{ afterDays: 4, amount: 90000, method: "CHEQUE" }, { afterDays: 40, amount: 85000, method: "BANK_TRANSFER", receipt: "RCPT-1007" }] },
  { company: "Mango Street Cafe", contact: "Dev Sharma", amount: 32000, budgetType: "MONTHLY", saleDate: "2026-09-25",
    payments: [{ afterDays: 1, amount: 8000, method: "CARD" }] },
  { company: "Ironwood Furniture", contact: "Kavya Pillai", amount: 97000, budgetType: "ONE_TIME", saleDate: "2026-10-30",
    payments: [{ afterDays: 3, amount: 97000, method: "UPI", receipt: "RCPT-1008" }] },
  { company: "Zenith Pharma", contact: "Rohit Banerjee", amount: 180000, budgetType: "ADVANCE", saleDate: "2026-11-08",
    payments: [{ afterDays: 1, amount: 60000, method: "BANK_TRANSFER", receipt: "RCPT-1009" }] },
];

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const force = process.argv.includes("--force");

  const existing = await pool.query<{ count: string }>("SELECT count(*) FROM sales WHERE notes = $1", [TAG]);
  if (Number(existing.rows[0].count) > 0 && !force) {
    console.log(`${existing.rows[0].count} demo sales already present — nothing to do. Re-run with --force to add another batch.`);
    await pool.end();
    return;
  }

  // Only these roles may record a sale (createSale rejects SUPER_ADMIN/HR), so
  // the credited "Sold by" varies by cycling whoever actually exists.
  const { rows: creators } = await pool.query<Creator>(
    `SELECT id, role, name FROM users
     WHERE status = 'ACTIVE' AND role IN ('MARKETING_HEAD','PRE_SALES','SALESPERSON')
     ORDER BY id`,
  );
  if (creators.length === 0) {
    console.error("No ACTIVE MARKETING_HEAD / PRE_SALES / SALESPERSON user exists — create one first, then re-run.");
    await pool.end();
    process.exitCode = 1;
    return;
  }

  let saleCount = 0;
  let paymentCount = 0;

  for (const [index, spec] of SALES.entries()) {
    const creator = creators[index % creators.length];
    const sale = await createSale(pool, {
      creatorId: creator.id,
      creatorRole: creator.role,
      companyName: spec.company,
      contactPerson: spec.contact,
      budgetAmount: spec.amount,
      budgetType: spec.budgetType,
      saleDate: spec.saleDate,
      notes: TAG,
    });
    saleCount++;

    for (const payment of spec.payments) {
      await recordSalePayment(pool, {
        actorId: creator.id,
        actorRole: creator.role,
        saleId: sale.id,
        amount: payment.amount,
        paymentMethod: payment.method,
        paymentDate: addDays(spec.saleDate, payment.afterDays),
        receiptNumber: payment.receipt,
        notes: TAG,
      });
      paymentCount++;
    }
  }

  console.log(`Seeded ${saleCount} sales and ${paymentCount} payments across ${creators.length} user(s).`);
  console.log(`Dates run ${SALES[0].saleDate} → ${SALES[SALES.length - 1].saleDate}; all 4 budget types and all 6 payment methods are represented.`);
  console.log("\nTo remove it again:");
  console.log(`  DELETE FROM sale_payments WHERE sale_id IN (SELECT id FROM sales WHERE notes = '${TAG}');`);
  console.log(`  DELETE FROM sales WHERE notes = '${TAG}';`);

  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exitCode = 1;
});
