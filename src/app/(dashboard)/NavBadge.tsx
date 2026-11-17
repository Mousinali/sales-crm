export default function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-sidebar-elevated px-1.5 py-0.5 text-xs font-medium text-sidebar-muted">
      {count}
    </span>
  );
}
