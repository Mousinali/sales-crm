import { saleBalance } from "@/lib/sales/balance";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

// "₹X due" in amber, "₹X excess paid" in violet when payments exceed the
// sale amount, or a plain "Fully paid". `dueLabel` lets a caller say
// "remaining" or "due on this sale" instead.
export default function BalanceText({ budget, paid, dueLabel = "due", className = "text-xs" }: { budget: number; paid: number; dueLabel?: string; className?: string }) {
  const { due, excess } = saleBalance(budget, paid);
  if (excess > 0) return <span className={`${className} font-medium text-violet-700`}>{rupees(excess)} excess paid</span>;
  if (due === 0) return <span className={`${className} text-emerald-700`}>Fully paid</span>;
  return <span className={`${className} text-amber-700`}>{rupees(due)} {dueLabel}</span>;
}
