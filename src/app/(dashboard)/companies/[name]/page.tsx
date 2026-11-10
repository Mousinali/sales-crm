import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { getCompany } from "@/lib/companies/get";
import { CompanyNotFoundError } from "@/lib/companies/errors";
import CompanyDetailView from "./CompanyDetailView";

export default async function CompanyDetailPage({ params }: { params: Promise<{ name: string }> }) {
  await requireRole(["SUPER_ADMIN", "MARKETING_HEAD"]);
  const { name } = await params;

  let company;
  try {
    company = await getCompany(pool, name);
  } catch (error) {
    if (error instanceof CompanyNotFoundError) notFound();
    throw error;
  }

  return <CompanyDetailView company={company} />;
}
