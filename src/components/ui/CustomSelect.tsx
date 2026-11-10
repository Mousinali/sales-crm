"use client";

import { useEffect, useRef, useState } from "react";

export type SelectOption = { value: string; label: string; icon?: string };

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
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selectedOptionRef = useRef<HTMLButtonElement>(null);
  const searchable = options.length > SEARCH_THRESHOLD;

  // Jumps straight to whichever option is already selected (if the list is
  // long enough that it might start off scrolled out of view) instead of
  // always opening at the top of the list regardless of where the current
  // value sits in it.
  useEffect(() => {
    // jsdom (unit tests) doesn't implement scrollIntoView at all.
    if (open) selectedOptionRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleMouseDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
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
  const filtered = searchLower ? options.filter((o) => o.label.toLowerCase().includes(searchLower)) : options;

  return (
    <div ref={containerRef} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-left text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected?.icon && (
            // eslint-disable-next-line @next/next/no-img-element -- a fixed local icon, not a user-uploaded or remote image next/image would optimize.
            <img src={selected.icon} alt="" className="h-4 w-4 shrink-0 object-contain" />
          )}
          <span className="truncate">{selected ? selected.label : placeholder}</span>
        </span>
        <i className={`ri-arrow-down-s-line shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-zinc-200 bg-white shadow-lg">
          {searchable && (
            <div className="relative border-b border-zinc-200">
              <i className="ri-search-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search…"
                aria-label="Search options"
                className="w-full py-2 pr-3 pl-9 text-sm text-zinc-900 focus:outline-none"
              />
            </div>
          )}
          <ul role="listbox" className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-zinc-500">No matches.</li>}
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
                  {o.icon && (
                    // eslint-disable-next-line @next/next/no-img-element -- a fixed local icon, not a user-uploaded or remote image next/image would optimize.
                    <img src={o.icon} alt="" className="h-4 w-4 shrink-0 object-contain" />
                  )}
                  <span className="truncate">{o.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
