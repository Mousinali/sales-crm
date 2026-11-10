// The same "are you sure?" shell every destructive/state-changing action in
// the app needs (delete a lead/company/user, deactivate an account, ...) —
// one overlay/card/button-row implementation instead of each view
// hand-rolling its own copy.
export default function ConfirmDialog({
  title,
  description,
  error,
  confirmLabel,
  pendingLabel,
  pending,
  tone = "danger",
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  error?: string | null;
  confirmLabel: string;
  pendingLabel?: string;
  pending: boolean;
  /** The confirm button's color: "danger" (red, e.g. Delete/Deactivate), "success" (green, e.g. Activate), or "brand" (e.g. Reset Access). */
  tone?: "danger" | "success" | "brand";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 px-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-2 text-base font-semibold text-zinc-900">{title}</h2>
        <p className="mb-4 text-sm text-zinc-500">{description}</p>
        {error && (
          <p role="alert" className="mb-4 text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
              tone === "danger"
                ? "bg-rose-600 hover:bg-rose-700 focus:ring-rose-400"
                : tone === "success"
                  ? "bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-400"
                  : "bg-brand-600 hover:bg-brand-700 focus:ring-brand-400"
            }`}
          >
            {pending ? (pendingLabel ?? "Working…") : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
