import { ROLE_LABELS } from "./roleDisplay";
import Avatar from "@/components/ui/Avatar";
import type { AuthUser } from "@/lib/auth/rbac";

export default function UserBadge({ user }: { user: AuthUser }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="relative shrink-0">
        <Avatar name={user.name} imageUrl={user.avatarUrl} size="md" />
        <span
          className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500"
          aria-hidden="true"
        />
      </span>
      <div>
        <p className="text-sm font-semibold text-zinc-900">{user.name}</p>
        <p className="text-xs text-zinc-500">{user.designation || ROLE_LABELS[user.role]}</p>
      </div>
    </div>
  );
}
