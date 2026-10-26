import { requireUser } from "@/lib/auth/rbac";
import { ROLE_BADGE_CLASSES, ROLE_LABELS, initialsOf } from "@/app/(dashboard)/roleDisplay";

export default async function DashboardPage() {
  // Re-validates the session here rather than trusting the layout above:
  // Next.js layouts don't re-render on navigation and don't gate their
  // child segments' RSC payload, so this page re-checks auth itself.
  const user = await requireUser();

  return (
    <div className="flex items-center gap-4 rounded-lg border border-zinc-200 bg-white p-6">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-semibold text-zinc-600">
        {initialsOf(user.name)}
      </span>
      <div>
        <p className="text-base font-semibold text-zinc-900">Welcome back, {user.name}</p>
        <span
          className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE_CLASSES[user.role]}`}
        >
          {ROLE_LABELS[user.role]}
        </span>
      </div>
    </div>
  );
}
