export type TimelineEntry = {
  id: number | string;
  icon: string;
  iconClass: string;
  title: string;
  description?: string | null;
  meta?: string | null;
  timestamp: string | Date;
  // Set for a date-only value (e.g. a payment's DATE column, no time
  // component) so the clock reads as "midnight" instead of showing a
  // fabricated time of day.
  dateOnly?: boolean;
};

function formatTimestamp(timestamp: string | Date, dateOnly?: boolean): string {
  // A plain "YYYY-MM-DD" string (a DATE column, no time) is parsed as UTC
  // midnight by `new Date(string)`, which can roll back a day once
  // converted to a timezone behind UTC. Building the Date from its
  // year/month/day parts instead keeps it anchored to the calendar day it
  // actually names, regardless of viewer timezone.
  if (dateOnly && typeof timestamp === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(timestamp);
    if (match) {
      const [, year, month, day] = match;
      const date = new Date(Number(year), Number(month) - 1, Number(day));
      return date.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    }
  }
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  return date.toLocaleString(
    "en-IN",
    // hour12: false (not the locale's AM/PM default) — Node's and the
    // browser's ICU data disagree on am/pm casing ("pm" vs "PM") for this
    // locale, which fails SSR hydration since the two don't render the
    // same string. A 24-hour clock has no am/pm text to disagree on.
    dateOnly
      ? { day: "numeric", month: "short", year: "numeric" }
      : { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false },
  );
}

// A vertical log, newest first — shared by the lead detail page's activity
// log and the sale detail page's payment history, since both are
// chronological records of what happened, not just a flat list.
export default function Timeline({ entries, emptyText }: { entries: TimelineEntry[]; emptyText: string }) {
  if (entries.length === 0) {
    return <p className="text-sm text-zinc-500">{emptyText}</p>;
  }

  return (
    <ol className="flex flex-col">
      {entries.map((entry, index) => (
        <li key={entry.id} className="relative flex gap-3">
          <div className="flex flex-col items-center">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${entry.iconClass}`}>
              <i className={`${entry.icon} text-base`} aria-hidden="true" />
            </span>
            {index < entries.length - 1 && <span className="w-px flex-1 bg-zinc-200" aria-hidden="true" />}
          </div>
          <div className={`flex flex-1 flex-col gap-0.5 ${index < entries.length - 1 ? "pb-5" : ""}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <p className="text-sm font-medium text-zinc-900">{entry.title}</p>
              <time className="text-xs text-zinc-400">{formatTimestamp(entry.timestamp, entry.dateOnly)}</time>
            </div>
            {entry.description && <p className="text-sm text-zinc-600">{entry.description}</p>}
            {entry.meta && <p className="text-xs text-zinc-500">{entry.meta}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
