import PageTitle from "./PageTitle";
import UserBadge from "./UserBadge";
import NotificationsBell from "./NotificationsBell";
import SignOutButton from "./SignOutButton";
import type { AuthUser } from "@/lib/auth/rbac";

export default function TopBar({ user }: { user: AuthUser }) {
  return (
    <header className="sticky top-0 z-10 hidden items-center justify-between border-b border-zinc-200 bg-white px-6 py-3 lg:flex">
      <PageTitle />
      <div className="flex items-center gap-4">
        <NotificationsBell />
        <UserBadge user={user} />
        <div className="h-8 w-px bg-zinc-200" aria-hidden="true" />
        <SignOutButton />
      </div>
    </header>
  );
}
