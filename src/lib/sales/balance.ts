// What's left to pay on a sale, or — when more has been paid than the sale
// is worth — how much extra came in. Exactly one of the two is non-zero.
export function saleBalance(budget: number, paid: number): { due: number; excess: number } {
  return { due: Math.max(budget - paid, 0), excess: Math.max(paid - budget, 0) };
}
