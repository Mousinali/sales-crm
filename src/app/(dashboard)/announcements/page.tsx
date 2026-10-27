import { requireRole } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { listAnnouncements } from "@/lib/email/announce";
import AnnouncementsView from "./AnnouncementsView";

export default async function AnnouncementsPage() {
  const user = await requireRole(["SUPER_ADMIN", "MARKETING_HEAD"]);
  const announcements = await listAnnouncements(pool, user);

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Announcements</h1>
      <AnnouncementsView
        initialAnnouncements={announcements.map((a) => ({ ...a, created_at: a.created_at.toISOString() }))}
      />
    </div>
  );
}
