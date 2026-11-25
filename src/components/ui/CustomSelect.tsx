"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFloatingMenu } from "./useFloatingMenu";
import { useDebouncedValue } from "./useDebouncedValue";

// `tone`: colours the closed control while this option is selected (e.g. a status
// dropdown that wears its status colour); `icon` then follows the tone's text colour.
export type SelectOption = { value: string; label: string; icon?: string; tone?: { trigger: string; icon: string } };

// `ri-*` is a Remix icon class (the font used across the app, brand-coloured unless the string carries its own `text-*` class); anything else is an image URL.
function OptionIcon({ icon }: { icon: string }) {
  if (icon.startsWith("ri-")) return <i className={`${icon} shrink-0 text-base leading-none ${icon.includes(" text-") ? "" : "text-brand-600"}`} aria-hidden="true" />;
  // eslint-disable-next-line @next/next/no-img-element -- a fixed local icon, not a user-uploaded or remote image next/image would optimize.
  return <img src={icon} alt="" className="h-4 w-4 shrink-0 object-contain" />;
}

// A styled stand-in for a native <select> — browsers render the native
// popup with their own OS chrome (the dark, unstyled overlay this was built
// to replace), which can't show a per-option icon and never matches the
// rest of the page. Same open/close-on-outside-click/Escape pattern as
// MultiSelectSearch, plus its own search box once the list is long enough
// that scanning it beats scrolling.
const SEARCH_THRESHOLD = 7;

export default function CustomSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "—",
  "aria-label": ariaLabel,
  onSearch,
  onLoadMore,
  hasMore = false,
  loading = false,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  // Filter dropdowns have no visible <label>, so without this a screen reader
  // announces them by whichever option happens to be selected and nothing else.
  "aria-label"?: string;
  // Server-driven mode: when `onSearch` is given the parent owns filtering
  // (so `options` is already the server's result — no client-side filter),
  // the search box always shows, and `onLoadMore` fetches the next page when
  // the list is scrolled near its end. Omit all four for a plain static list.
  onSearch?: (query: string) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const position = useFloatingMenu(open, triggerRef);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selectedOptionRef = useRef<HTMLButtonElement>(null);
  const serverDriven = onSearch != null;
  const searchable = serverDriven || options.length > SEARCH_THRESHOLD;

  // Server-driven mode: push the (debounced) query up so the parent refetches.
  const debouncedSearch = useDebouncedValue(search, 300);
  useEffect(() => {
    if (onSearch) onSearch(debouncedSearch.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // Jumps straight to whichever option is already selected (if the list is
  // long enough that it might start off scrolled out of view) instead of
  // always opening at the top of the list regardless of where the current
  // value sits in it.
  const positioned = position !== null;
  useEffect(() => {
    // jsdom (unit tests) doesn't implement scrollIntoView at all.
    // `position`: the portaled menu only exists once it has been measured.
    if (open && positioned) selectedOptionRef.current?.scrollIntoView?.({ block: "nearest" });
  // `positioned`, not `position`: scrolling the list re-measures position, which would snap back to the selection.
  }, [open, positioned]);

  useEffect(() => {
    if (!open) return;
    function handleMouseDown(event: MouseEvent) {
      const target = event.target as Node;
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
    if (searchable) requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  const selected = options.find((o) => o.value === value);
  const searchLower = search.trim().toLowerCase();
  // Server-driven mode already returns the filtered page; don't filter again.
  const filtered = serverDriven || !searchLower ? options : options.filter((o) => o.label.toLowerCase().includes(searchLower));

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        // combobox is the role for a control that expands a listbox; without it
        // this reads to assistive tech as a plain button.
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 ${
          selected?.tone ? `font-medium ${selected.tone.trigger}` : "border-zinc-300 bg-white text-zinc-900"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected?.icon && <OptionIcon icon={selected.tone ? selected.icon.replace(selected.tone.icon, "text-current") : selected.icon} />}
          <span className="truncate">{selected ? selected.label : placeholder}</span>
        </span>
        <i className={`ri-arrow-down-s-line shrink-0 transition-transform ${selected?.tone ? "opacity-60" : "text-zinc-400"} ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {open && position && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", left: position.left, minWidth: position.width, maxWidth: `calc(100vw - ${position.left + 8}px)`, top: position.top, bottom: position.bottom }}
          className="z-[100] w-max overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg"
        >
          {searchable && (
            <div className="relative border-b border-zinc-200 p-2">
              <i className="ri-search-line pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-brand-600" aria-hidden="true" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search…"
                aria-label="Search options"
                className="w-full rounded-md border border-zinc-300 py-1.5 pr-3 pl-9 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </div>
          )}
          <ul
            role="listbox"
            style={{ maxHeight: Math.min(position.maxHeight - 64, 280) }}
            className="overflow-y-auto overscroll-contain py-1"
            onScroll={(event) => {
              if (!onLoadMore || !hasMore || loading) return;
              const el = event.currentTarget;
              if (el.scrollHeight - el.scrollTop - el.clientHeight < 48) onLoadMore();
            }}
          >
            {filtered.length === 0 && !loading && <li className="px-3 py-2 text-sm text-zinc-500">No matches.</li>}
            {filtered.map((o) => (
              <li key={o.value}>
                <button
                  ref={o.value === value ? selectedOptionRef : undefined}
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-zinc-50 ${
                    o.value === value ? "bg-brand-50 text-brand-700" : "text-zinc-700"
                  }`}
                >
                  {o.icon && <OptionIcon icon={o.icon} />}
                  <span className="whitespace-nowrap">{o.label}</span>
                </button>
              </li>
            ))}
            {loading && <li className="px-3 py-2 text-sm text-zinc-500">Loading…</li>}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  );
}
