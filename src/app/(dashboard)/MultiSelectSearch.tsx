"use client";

import { useMemo, useState } from "react";

export type MultiSelectOption = { id: number; name: string; description?: string | null };

export default function MultiSelectSearch({
  id,
  options,
  selectedIds,
  onChange,
  placeholder = "Search…",
}: {
  id: string;
  options: MultiSelectOption[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = options.filter((o) => selectedIds.includes(o.id));
  const filtered = useMemo(
    () => options.filter((o) => o.name.toLowerCase().includes(search.trim().toLowerCase())),
    [options, search],
  );

  function toggle(optionId: number) {
    onChange(selectedIds.includes(optionId) ? selectedIds.filter((i) => i !== optionId) : [...selectedIds, optionId]);
  }

  function remove(optionId: number) {
    onChange(selectedIds.filter((i) => i !== optionId));
  }

  return (
    <div className="relative">
      <button
        id={id}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-left text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
      >
        {selected.length === 0 ? (
          <span className="text-zinc-400">Select…</span>
        ) : (
          `${selected.length} selected`
        )}
      </button>

      {selected.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {selected.map((o) => (
            <span
              key={o.id}
              className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700"
            >
              {o.name}
              <button
                type="button"
                aria-label={`Remove ${o.name}`}
                onClick={() => remove(o.id)}
                className="text-indigo-500 hover:text-indigo-800"
              >
                <i className="ri-close-line" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-zinc-200 bg-white shadow-lg">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={placeholder}
            aria-label="Search services"
            className="w-full border-b border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:outline-none"
          />
          <ul className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-zinc-500">No matches.</li>}
            {filtered.map((o) => (
              <li key={o.id}>
                <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-zinc-50">
                  <input type="checkbox" checked={selectedIds.includes(o.id)} onChange={() => toggle(o.id)} />
                  <span>
                    {o.name}
                    {o.description && <span className="ml-1 text-xs text-zinc-500">({o.description})</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex justify-end border-t border-zinc-200 px-3 py-1.5">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
