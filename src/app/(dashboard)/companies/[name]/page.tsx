import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { getCompany } from "@/lib/companies/get";
import { viewerScope } from "@/lib/companies/list";
import { CompanyNotFoundError } from "@/lib/companies/errors";
import CompanyDetailView from "./CompanyDetailView";

export default async function CompanyDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const user = await requireRole(["SUPER_ADMIN", "ACCOUNTANT", "MARKETING_HEAD", "PRE_SALES", "SALESPERSON"]);
  const { name } = await params;

  let company;
  try {
    company = await getCompany(pool, name, viewerScope(user));
  } catch (error) {
    if (error instanceof CompanyNotFoundError) notFound();
    throw error;
  }

  // An Accountant sees the company's details and sales, never its leads.
  const showLeads = user.role !== "ACCOUNTANT";
  return (
    <CompanyDetailView
      company={showLeads ? company : { ...company, leads: [] }}
      showLeads={showLeads}
      canDelete={user.role === "SUPER_ADMIN"}
    />
  );
}
