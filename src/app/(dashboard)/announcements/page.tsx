import { requireRole } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { listAnnouncements } from "@/lib/email/announce";
import PageHeading from "@/components/ui/PageHeading";
import AnnouncementsView from "./AnnouncementsView";

export default async function AnnouncementsPage() {
  const user = await requireRole(["SUPER_ADMIN", "MARKETING_HEAD"]);
  const announcements = await listAnnouncements(pool, user);

  return (
    <div>
      <PageHeading title="Announcements" count={announcements.length} crumbs={[{ label: "Announcements" }]} />
      <AnnouncementsView
        initialAnnouncements={announcements.map((a) => ({ ...a, created_at: a.created_at.toISOString() }))}
      />
    </div>
  );
}
