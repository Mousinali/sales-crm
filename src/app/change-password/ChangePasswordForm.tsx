"use client";

import { useState, type FormEvent } from "react";

export default function ChangePasswordForm({
  requireCurrentPassword,
  onSuccess,
}: {
  requireCurrentPassword: boolean;
  onSuccess?: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (requireCurrentPassword && currentPassword.length === 0) {
      setError("Enter your current password.");
      return;
    }

    if (password.length < 8 || confirmPassword.length < 8) {
      setError("Enter a password with at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          requireCurrentPassword ? { currentPassword, password } : { password },
        ),
      });

      if (!response.ok) {
        setError(response.status === 403 ? "Current password is incorrect." : "Something went wrong. Try again.");
        setSubmitting(false);
        return;
      }

      if (onSuccess) {
        setSubmitting(false);
        setCurrentPassword("");
        setPassword("");
        setConfirmPassword("");
        onSuccess();
      } else {
        window.location.href = "/dashboard";
      }
    } catch {
      setError("Something went wrong. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {requireCurrentPassword && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="currentPassword" className="text-sm font-medium text-zinc-700">
            Current password
          </label>
          <div className="relative">
            <i
              className="ri-lock-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
              aria-hidden="true"
            />
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your current password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white/90 py-2.5 pr-3 pl-10 text-base text-zinc-900 placeholder:text-sm placeholder:text-zinc-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-zinc-700">
          New password
        </label>
        <div className="relative">
          <i
            className="ri-lock-password-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          />
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white/90 py-2.5 pr-3 pl-10 text-base text-zinc-900 placeholder:text-sm placeholder:text-zinc-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirmPassword" className="text-sm font-medium text-zinc-700">
          Confirm password
        </label>
        <div className="relative">
          <i
            className="ri-lock-password-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          />
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="Re-enter your new password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white/90 py-2.5 pr-3 pl-10 text-base text-zinc-900 placeholder:text-sm placeholder:text-zinc-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? (
          <>
            <i className="ri-loader-4-line animate-spin" aria-hidden="true" />
            Saving…
          </>
        ) : (
          "Set new password"
        )}
      </button>
    </form>
  );
}
