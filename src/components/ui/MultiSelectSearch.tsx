"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFloatingMenu } from "./useFloatingMenu";

export type MultiSelectOption = { id: number; name: string; description?: string | null };

export default function MultiSelectSearch({
  id,
  options,
  selectedIds,
  onChange,
  placeholder = "Search…",
  multiple = true,
  onSearchChange,
}: {
  id: string;
  options: MultiSelectOption[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  placeholder?: string;
  /** false turns this into a single-pick searchable dropdown: picking an option selects it and closes the menu, with no chips/checkboxes. */
  multiple?: boolean;
  /** Called with what the user types in the menu's search box, for a parent that also searches server-side. */
  onSearchChange?: (search: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const position = useFloatingMenu(open, triggerRef);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => options.filter((o) => selectedIds.includes(o.id)), [options, selectedIds]);
  const filtered = useMemo(
    () => options.filter((o) => o.name.toLowerCase().includes(search.trim().toLowerCase())),
    [options, search],
  );

  // A dropdown only its own trigger can close feels stuck open to anyone
  // used to a native <select> — close on an outside click or Escape too.
  useEffect(() => {
    if (!open) return;
    function handleMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      // The menu lives in a portal, outside containerRef, so it counts as "inside" too.
      if (!containerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function openMenu() {
    setOpen(true);
    setSearch("");
    // The menu isn't in the DOM yet on this same tick.
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function toggle(optionId: number) {
    if (!multiple) {
      onChange([optionId]);
      setOpen(false);
      return;
    }
    onChange(selectedIds.includes(optionId) ? selectedIds.filter((i) => i !== optionId) : [...selectedIds, optionId]);
  }

  function remove(optionId: number) {
    onChange(selectedIds.filter((i) => i !== optionId));
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex w-full items-center justify-between gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-left text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
      >
        <span className="truncate">
          {selected.length === 0 ? (
            <span className="text-zinc-400">Select…</span>
          ) : multiple ? (
            `${selected.length} selected`
          ) : (
            selected[0].name
          )}
        </span>
        <i
          className={`ri-arrow-down-s-line shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {multiple && selected.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {selected.map((o) => (
            <span
              key={o.id}
              className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700"
            >
              {o.name}
              <button
                type="button"
                aria-label={`Remove ${o.name}`}
                onClick={() => remove(o.id)}
                className="text-brand-500 hover:text-brand-800"
              >
                <i className="ri-close-line" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && position && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", left: position.left, width: position.width, top: position.top, bottom: position.bottom }}
          className="z-[100] flex flex-col overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg"
        >
          <div className="relative border-b border-zinc-200">
            <i
              className="ri-search-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
              aria-hidden="true"
            />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                onSearchChange?.(event.target.value);
              }}
              placeholder={placeholder}
              aria-label={placeholder}
              className="w-full py-2 pr-3 pl-9 text-sm text-zinc-900 focus:outline-none"
            />
          </div>
          <ul role="listbox" aria-multiselectable={multiple} style={{ maxHeight: Math.min(position.maxHeight - 90, 320) }} className="overflow-y-auto overscroll-contain py-1">
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-zinc-500">No matches.</li>}
            {filtered.map((o) => (
              <li key={o.id}>
                <label className="flex cursor-pointer items-start gap-2 px-3 py-1.5 text-sm hover:bg-zinc-50">
                  <input
                    className="mt-0.5 shrink-0"
                    type={multiple ? "checkbox" : "radio"}
                    name={multiple ? undefined : id}
                    checked={selectedIds.includes(o.id)}
                    onChange={() => toggle(o.id)}
                  />
                  <span className="min-w-0">
                    <span className="block">{o.name}</span>
                    {o.description && o.description !== o.name && <span className="block text-xs text-zinc-500">{o.description}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {multiple && (
            <div className="flex items-center justify-between border-t border-zinc-200 px-3 py-1.5">
              <button
                type="button"
                onClick={() => onChange([])}
                disabled={selected.length === 0}
                className="rounded-md px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear all
              </button>
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
