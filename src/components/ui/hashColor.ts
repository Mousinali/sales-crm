// A handful of tasteful tints, picked by a hash of a name/seed so the same
// text always lands on the same color — gives a column of avatars visual
// variety (easier to tell rows apart at a glance) without being random
// from one render to the next.
const PALETTE = [
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-teal-100 text-teal-700",
];

// The solid "-600" hex of each PALETTE tint above, same order — for a
// context (a dashboard bar fill) that needs a real color value rather
// than a Tailwind class, while still landing on the same hue per name as
// that name's Avatar.
const PALETTE_HEX = ["#0284c7", "#059669", "#7c3aed", "#d97706", "#e11d48", "#0d9488"];

function hashIndex(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(hash) % PALETTE.length;
}

export function hashColor(seed: string): string {
  return PALETTE[hashIndex(seed)];
}

export function hashColorHex(seed: string): string {
  return PALETTE_HEX[hashIndex(seed)];
}
