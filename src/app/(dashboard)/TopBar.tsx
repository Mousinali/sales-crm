import PageTitle from "./PageTitle";
import UserBadge from "./UserBadge";
import NotificationsBell from "./NotificationsBell";
import SignOutButton from "./SignOutButton";
import type { AuthUser } from "@/lib/auth/rbac";

export default function TopBar({ user }: { user: AuthUser }) {
  return (
    <>
      <header className="hidden items-center justify-between border-b border-zinc-200 bg-white px-6 py-3 lg:flex">
        <PageTitle />
        <div className="flex items-center gap-4">
          <UserBadge user={user} />
          <NotificationsBell />
          <div className="h-8 w-px bg-zinc-200" aria-hidden="true" />
          <SignOutButton />
        </div>
      </header>

      <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-2 lg:hidden">
        <UserBadge user={user} compact />
        <div className="flex items-center gap-1">
          <NotificationsBell />
          <SignOutButton />
        </div>
      </div>
    </>
  );
}
