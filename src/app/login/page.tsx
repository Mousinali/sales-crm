import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/rbac";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-zinc-900">Sales CRM</h1>
        <p className="mb-6 text-sm text-zinc-500">Sign in to continue.</p>
        <LoginForm />
      </div>
    </div>
  );
}
