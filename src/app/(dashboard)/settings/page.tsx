import { requireUser } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { getOwnContactDetails } from "@/lib/users/list";
import PageHeading from "@/components/ui/PageHeading";
import { ROLE_LABELS } from "@/app/(dashboard)/roleDisplay";
import SettingsView from "./SettingsView";

export default async function SettingsPage() {
  const user = await requireUser();
  const { phone, whatsappNumber } = await getOwnContactDetails(pool, user.id);

  return (
    <div>
      <PageHeading title="Settings" crumbs={[{ label: "Settings" }]} />
      <SettingsView
        name={user.name}
        title={user.designation || ROLE_LABELS[user.role]}
        avatarUrl={user.avatarUrl}
        phone={phone}
        whatsappNumber={whatsappNumber}
      />
    </div>
  );
}
