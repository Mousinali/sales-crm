"use client";

export default function SignOutButton() {
  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2"
    >
      <i className="ri-logout-box-r-line" aria-hidden="true" />
      Sign out
    </button>
  );
}
