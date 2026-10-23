import { requireUser } from "../../../lib/auth/rbac";

export default async function DashboardPage() {
  // Re-validates the session here rather than trusting the layout above:
  // Next.js layouts don't re-render on navigation and don't gate their
  // child segments' RSC payload, so this page re-checks auth itself.
  const user = await requireUser();

  return (
    <p className="text-sm text-zinc-700">
      Welcome, {user.name} ({user.role}).
    </p>
  );
}
