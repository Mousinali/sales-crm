import { requireUser } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { listNotificationsPage } from "@/lib/notifications/record";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import NotificationsView from "./NotificationsView";

export default async function NotificationsPage() {
  const user = await requireUser();
  const result = await listNotificationsPage(pool, user.id, {}, { page: 1, pageSize: DEFAULT_PAGE_SIZE });

  return (
    <NotificationsView
      initialNotifications={result.items}
      initialTotal={result.total}
      initialTotalPages={result.totalPages}
    />
  );
}
