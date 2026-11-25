import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { getCompany } from "@/lib/companies/get";
import { viewerScope } from "@/lib/companies/list";
import { CompanyNotFoundError } from "@/lib/companies/errors";
import CompanyDetailView from "./CompanyDetailView";

export default async function CompanyDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const user = await requireRole(["SUPER_ADMIN", "ACCOUNTANT", "HR", "MARKETING_HEAD", "PRE_SALES", "SALESPERSON"]);
  const { name: rawName } = await params;
  // The segment can arrive still percent-encoded (spaces as %20) — decode it, but never 500 on a malformed one.
  const name = (() => { try { return decodeURIComponent(rawName); } catch { return rawName; } })();

  let company;
  try {
    // An Accountant or HR sees the company's details and sales, never its leads.
    company = await getCompany(pool, name, viewerScope(user), { includeLeads: user.role !== "ACCOUNTANT" && user.role !== "HR", includeTransfers: user.role === "SUPER_ADMIN" });
  } catch (error) {
    if (error instanceof CompanyNotFoundError) notFound();
    throw error;
  }

  const showLeads = user.role !== "ACCOUNTANT" && user.role !== "HR";
  return (
    <CompanyDetailView
      company={showLeads ? company : { ...company, leads: [] }}
      showLeads={showLeads}
      canDelete={user.role === "SUPER_ADMIN"}
      canEdit={user.role === "SUPER_ADMIN"}
    />
  );
}
