import type { ReactNode } from "react";
import { toast } from "@/lib/toast";

async function copyValue(value: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  } catch {
    toast.error(`Could not copy ${label.toLowerCase()}`);
  }
}

// Pass `copyText` to get a copy button; the same text is the hover tooltip,
// so a value cut off with "…" can still be read in full.
function CopyButton({ text, label }: { text: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => void copyValue(text, label)}
      aria-label={`Copy ${label.toLowerCase()}`}
      title={`Copy ${label.toLowerCase()}`}
      className="shrink-0 cursor-pointer rounded p-1.5 text-zinc-400 hover:bg-black/5 hover:text-zinc-600"
    >
      <i className="ri-file-copy-line text-sm" aria-hidden="true" />
    </button>
  );
}

// Every field's icon gets one flat color (bg + matching icon tone, no
// gradients) so a page's info cards read as a consistent set rather than
// each row picking its own look. Shared by any detail page that shows a
// list of labelled fields (leads today; companies/users could reuse it).
export function IconChip({ icon, className }: { icon: string; className: string }) {
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${className}`}>
      <i className={`${icon} text-base`} aria-hidden="true" />
    </span>
  );
}

export function InfoRow({
  icon,
  iconClass,
  label,
  children,
  action,
  copyText,
}: {
  icon: string;
  iconClass: string;
  label: string;
  children: ReactNode;
  action?: ReactNode;
  copyText?: string | null;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-zinc-100 py-3 last:border-0">
      <IconChip icon={icon} className={iconClass} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-zinc-500">{label}</p>
        <div title={copyText ?? undefined} className="truncate text-sm font-medium text-zinc-900">{children}</div>
      </div>
      {copyText && <CopyButton text={copyText} label={label} />}
      {action}
    </div>
  );
}

export function InfoTile({
  icon,
  iconClass,
  tileClass,
  label,
  children,
  className = "",
  copyText,
}: {
  icon: string;
  iconClass: string;
  tileClass: string;
  label: string;
  children: ReactNode;
  className?: string;
  copyText?: string | null;
}) {
  return (
    <div className={`flex items-start gap-3 rounded-lg p-3 ${tileClass} ${className}`}>
      <IconChip icon={icon} className={iconClass} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-zinc-500">{label}</p>
        <div title={copyText ?? undefined} className="text-sm font-semibold break-words text-zinc-900">{children}</div>
      </div>
      {copyText && <CopyButton text={copyText} label={label} />}
    </div>
  );
}
