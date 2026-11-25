import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { countAuditByCategory, listAuditLogsPage } from "@/lib/audit/list";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import PageHeading from "@/components/ui/PageHeading";
import { formatRoleLabel } from "@/app/(dashboard)/roleDisplay";
import Avatar from "@/components/ui/Avatar";
import LogsView from "../LogsView";

export default async function UserLogsPage({ params }: { params: Promise<{ userId: string }> }) {
  await requireRole(["SUPER_ADMIN"]);
  const userId = Number((await params).userId);
  if (!Number.isSafeInteger(userId)) notFound();

  const { rows } = await pool.query<{ name: string; email: string; role: string }>("SELECT name, email, role FROM users WHERE id = $1", [userId]);
  const user = rows[0];
  if (!user) notFound();

  const [result, categoryCounts] = await Promise.all([listAuditLogsPage(pool, { userId, period: "today" }, { page: 1, pageSize: DEFAULT_PAGE_SIZE }), countAuditByCategory(pool, userId, "today")]);
  const { rows: lastLogin } = await pool.query<{ created_at: Date; details: { device?: string; browser?: string; os?: string } | null }>(
    "SELECT created_at, details FROM audit_logs WHERE actor_user_id = $1 AND action = 'user.login' ORDER BY created_at DESC LIMIT 1",
    [userId],
  );
  const login = lastLogin[0];

  return (
    <div>
      <PageHeading title={user.name} count={result.total} crumbs={[{ label: "Logs", href: "/logs" }, { label: user.name }]} />
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-white p-4">
        <Avatar name={user.name} size="md" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-zinc-900">
            {user.name} <span className="ml-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-normal text-zinc-600">{formatRoleLabel(user.role)}</span>
          </p>
          <p className="truncate text-sm text-zinc-500">{user.email}</p>
        </div>
        <p className="text-sm text-zinc-500">
          {login ? (
            <>
              Last login {login.created_at.toLocaleString("en-US", { timeZone: "Asia/Kolkata", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              {login.details?.device && (
                <span className="ml-2 inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">
                  {login.details.device} · {[login.details.browser, login.details.os].filter(Boolean).join(" on ")}
                </span>
              )}
            </>
          ) : (
            "No logins recorded yet"
          )}
        </p>
      </div>
      <LogsView
        userId={userId}
        initialCategoryCounts={categoryCounts}
        initialLogs={result.items.map((log) => ({ ...log, created_at: log.created_at.toISOString() }))}
        initialTotal={result.total}
        initialTotalPages={result.totalPages}
      />
    </div>
  );
}
