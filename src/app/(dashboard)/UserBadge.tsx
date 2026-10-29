import { ROLE_BADGE_CLASSES, ROLE_LABELS, initialsOf } from "./roleDisplay";
import type { AuthUser } from "@/lib/auth/rbac";

export default function UserBadge({ user, compact = false }: { user: AuthUser; compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
        {initialsOf(user.name)}
      </span>
      <div className={compact ? "" : "text-right"}>
        <p className="text-sm font-medium text-zinc-900">{user.name}</p>
        <span
          className={`mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE_CLASSES[user.role]}`}
        >
          {ROLE_LABELS[user.role]}
        </span>
      </div>
    </div>
  );
}
