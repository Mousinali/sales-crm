"use client";

import DateField from "./DateField";
import TimeField from "./TimeField";

const DEFAULT_TIME = "09:00";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Date + time pair in place of <input type="datetime-local">; same
// "YYYY-MM-DDTHH:mm" string in and out. Stacks on narrow screens.
export default function DateTimeField({ id, value, onChange }: { id?: string; value: string; onChange: (value: string) => void }) {
  const [date = "", time = ""] = value.split("T");
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[3fr_2fr]">
      <DateField id={id} value={date} onChange={(d) => onChange(d ? `${d}T${time || DEFAULT_TIME}` : "")} />
      <TimeField value={time.slice(0, 5)} onChange={(t) => onChange(`${date || today()}T${t}`)} />
    </div>
  );
}
