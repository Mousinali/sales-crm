"use client";

import { Toaster } from "sonner";

// `expand={false}` + `visibleToasts={3}` is the stacked-peek-that-expands-
// on-hover behavior — Sonner's own stacking engine, our markup (ToastCard
// in @/lib/toast) provides the visuals.
export default function AppToaster() {
  return <Toaster position="bottom-right" expand={false} visibleToasts={3} gap={10} />;
}
