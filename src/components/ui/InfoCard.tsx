import type { ReactNode } from "react";

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
}: {
  icon: string;
  iconClass: string;
  label: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-zinc-100 py-3 last:border-0">
      <IconChip icon={icon} className={iconClass} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-zinc-500">{label}</p>
        <div className="truncate text-sm font-medium text-zinc-900">{children}</div>
      </div>
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
}: {
  icon: string;
  iconClass: string;
  tileClass: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start gap-3 rounded-lg p-3 ${tileClass} ${className}`}>
      <IconChip icon={icon} className={iconClass} />
      <div className="min-w-0">
        <p className="text-xs text-zinc-500">{label}</p>
        <div className="text-sm font-semibold text-zinc-900">{children}</div>
      </div>
    </div>
  );
}
