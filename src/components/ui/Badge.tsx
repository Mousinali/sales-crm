import type { ReactNode } from "react";

// A colored pill, optionally with a leading icon — shared by status and
// priority badges so every one of them lines up at the same size/padding
// instead of each call site hand-rolling its own `inline-flex ... rounded-full`.
export default function Badge({ icon, className, children }: { icon?: string; className: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {icon && <i className={icon} aria-hidden="true" />}
      {children}
    </span>
  );
}
