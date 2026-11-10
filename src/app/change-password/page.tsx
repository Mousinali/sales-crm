import { requireUser } from "@/lib/auth/rbac";
import ChangePasswordForm from "./ChangePasswordForm";

export default async function ChangePasswordPage() {
  const user = await requireUser({ skipMustChangePasswordCheck: true });

  return (
    <div
      className="flex flex-1 items-center justify-center bg-zinc-100 bg-cover bg-center px-4 py-16"
      style={{ backgroundImage: "url(/login/login-bg.webp)" }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/60 bg-white/75 p-8 shadow-xl shadow-zinc-900/10 backdrop-blur-xl">
        <div className="mb-7 flex flex-col items-center text-center">
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/60 bg-white/40 text-2xl text-brand-500 shadow-sm backdrop-blur-md">
            <i className="ri-lock-password-line" aria-hidden="true" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Set a new password</h1>
          <p className="mt-1.5 text-sm text-zinc-500">You must set your own password before continuing.</p>
        </div>
        <ChangePasswordForm requireCurrentPassword={!user.mustChangePassword} />
      </div>
    </div>
  );
}
