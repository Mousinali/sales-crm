import { requireUser } from "../../lib/auth/rbac";
import ChangePasswordForm from "./ChangePasswordForm";

export default async function ChangePasswordPage() {
  await requireUser();

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-zinc-900">Set a new password</h1>
        <p className="mb-6 text-sm text-zinc-500">You must set your own password before continuing.</p>
        <ChangePasswordForm />
      </div>
    </div>
  );
}
