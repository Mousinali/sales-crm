import { ROLE_BADGE_CLASSES, ROLE_LABELS } from "./roleDisplay";
import Avatar from "@/components/ui/Avatar";
import type { AuthUser } from "@/lib/auth/rbac";

export default function UserBadge({ user, compact = false }: { user: AuthUser; compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar name={user.name} imageUrl={user.avatarUrl} size="md" />
      <div className={compact ? "" : "text-right"}>
        <p className="text-sm font-medium text-zinc-900">{user.name}</p>
        <span
          className={`mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE_CLASSES[user.role]}`}
        >
          {user.designation || ROLE_LABELS[user.role]}
        </span>
      </div>
    </div>
  );
}
