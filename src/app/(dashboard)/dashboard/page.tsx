import { getCurrentUser } from "../../../lib/auth/rbac";

export default async function DashboardPage() {
  // The layout above already redirects to /login when there is no session,
  // so by the time this page renders `user` is guaranteed non-null.
  const user = (await getCurrentUser())!;

  return (
    <p className="text-sm text-zinc-700">
      Welcome, {user.name} ({user.role}).
    </p>
  );
}
