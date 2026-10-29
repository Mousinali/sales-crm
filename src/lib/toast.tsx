"use client";

import { toast as sonnerToast } from "sonner";

export type ToastVariant = "success" | "error" | "info" | "warning";

// Each variant gets one consistent icon + color, same convention as the
// role/status/priority badges elsewhere in the app — the color itself
// becomes a recognizable shorthand, not decoration.
const VARIANT_STYLES: Record<ToastVariant, { icon: string; iconClass: string }> = {
  success: { icon: "ri-checkbox-circle-fill", iconClass: "bg-emerald-50 text-emerald-600" },
  error: { icon: "ri-error-warning-fill", iconClass: "bg-rose-50 text-rose-600" },
  warning: { icon: "ri-alert-fill", iconClass: "bg-amber-50 text-amber-600" },
  info: { icon: "ri-information-fill", iconClass: "bg-sky-50 text-sky-600" },
};

function ToastCard({
  id,
  variant,
  title,
  description,
}: {
  id: string | number;
  variant: ToastVariant;
  title: string;
  description?: string;
}) {
  const { icon, iconClass } = VARIANT_STYLES[variant];
  return (
    <div
      role="status"
      className="group relative flex w-full max-w-sm items-center gap-3 rounded-2xl border border-zinc-100 bg-white px-4 py-3 shadow-lg shadow-zinc-900/5"
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${iconClass}`}>
        <i className={`${icon} text-base`} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-zinc-900">{title}</p>
        {description && <p className="truncate text-xs text-zinc-500">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => sonnerToast.dismiss(id)}
        className="shrink-0 rounded-full bg-zinc-100 px-3.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
      >
        Dismiss
      </button>
      <button
        type="button"
        onClick={() => sonnerToast.dismiss(id)}
        aria-label="Close"
        className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-400 opacity-0 shadow-sm transition-opacity hover:text-zinc-700 group-hover:opacity-100 focus:opacity-100 focus:outline-none"
      >
        <i className="ri-close-line text-xs" aria-hidden="true" />
      </button>
    </div>
  );
}

function showToast(variant: ToastVariant, title: string, description?: string) {
  sonnerToast.custom((id) => <ToastCard id={id} variant={variant} title={title} description={description} />, {
    duration: variant === "error" ? 6000 : 4000,
  });
}

export const toast = {
  success: (title: string, description?: string) => showToast("success", title, description),
  error: (title: string, description?: string) => showToast("error", title, description),
  info: (title: string, description?: string) => showToast("info", title, description),
  warning: (title: string, description?: string) => showToast("warning", title, description),
};
