"use client";

import { useState } from "react";

function OptionIcon({ icon }: { icon: string }) {
  // Two icon shapes already exist in this codebase: a Remix Icon class
  // (an <i> font glyph) and a static SVG file path (an <img>) — detecting
  // "/" lets one prop accept either without the caller normalizing first.
  if (icon.startsWith("/")) {
    // eslint-disable-next-line @next/next/no-img-element -- a small fixed icon asset, not a user image next/image would optimize.
    return <img src={icon} alt="" className="h-4 w-4 shrink-0" aria-hidden="true" />;
  }
  return <i className={`${icon} shrink-0 text-base`} aria-hidden="true" />;
}

// A pill button + menu, same shape as the dashboard's period dropdown —
// shared so every custom filter dropdown reads as one control.
export default function FilterDropdown<T extends string>({
  icon,
  ariaLabel,
  value,
  options,
  onChange,
  optionIcons,
  searchable = false,
  fullWidth = false,
}: {
  icon: string;
  ariaLabel: string;
  value: T | "";
  options: { value: T | ""; label: string }[];
  onChange: (value: T | "") => void;
  // Per-option icon (Remix class or "/path.svg"), keyed by option value —
  // the trigger's own `icon` still stands in for any option that has none
  // (e.g. the "All ___" entry).
  optionIcons?: Partial<Record<T | "", string>>;
  // A search box above the list, for the one dropdown (lead sources) with
  // enough options that scanning them unfiltered is the slower path.
  searchable?: boolean;
  // Stretches the button and its menu to the parent's width instead of
  // sizing to content — only where the parent itself owns the row (the
  // mobile filter bottom sheet), never the default inline/pill usage.
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedLabel = options.find((o) => o.value === value)?.label ?? options[0]?.label;
  const visibleOptions = query ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())) : options;

  function close() {
    setOpen(false);
    setQuery("");
  }

  return (
    <div className={`relative ${fullWidth ? "w-full" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-400 ${
          fullWidth ? "w-full justify-between" : ""
        }`}
      >
        <span className="flex items-center gap-2 truncate">
          <OptionIcon icon={optionIcons?.[value] ?? icon} />
          <span className="truncate">{selectedLabel}</span>
        </span>
        <i className="ri-arrow-down-s-line shrink-0 text-zinc-400" aria-hidden="true" />
      </button>
      {open && (
        <>
          <button type="button" aria-label={`Close ${ariaLabel.toLowerCase()} menu`} onClick={close} className="fixed inset-0 z-40 cursor-default" />
          <div
            className={`absolute left-0 top-full z-50 mt-1.5 max-h-72 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-1 shadow-lg ${
              fullWidth ? "w-full" : "w-40"
            }`}
          >
            {searchable && (
              <div className="sticky top-0 bg-white p-1 pb-1.5">
                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search…"
                  autoFocus
                  className="w-full rounded-md border border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-900 focus:border-brand-400 focus:outline-none"
                />
              </div>
            )}
            {visibleOptions.length === 0 ? (
              <p className="px-2.5 py-1.5 text-sm text-zinc-400">No matches.</p>
            ) : (
              visibleOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    close();
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
                    option.value === value ? "bg-brand-50 text-brand-700" : "text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  {optionIcons && <OptionIcon icon={optionIcons[option.value] ?? icon} />}
                  <span className="truncate">{option.label}</span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
