import { requireRole } from "@/lib/auth/rbac";
import PageHeading from "@/components/ui/PageHeading";
import NewPaymentForm from "./NewPaymentForm";

export default async function NewPaymentPage() {
  await requireRole(["SUPER_ADMIN", "MARKETING_HEAD", "PRE_SALES", "SALESPERSON", "ACCOUNTANT"]);

  return (
    <div>
      <PageHeading title="New Payment" crumbs={[{ label: "Payments", href: "/payments" }, { label: "New Payment" }]} />
      <NewPaymentForm />
    </div>
  );
}
