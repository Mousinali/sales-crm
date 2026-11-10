export type Tab = { id: string; label: string; icon?: string; count?: number };

// A plain underline tab bar — the content panel beneath it is the caller's
// job (each panel usually needs its own hooks/forms, which doesn't fit a
// generic children-swap prop cleanly).
export default function Tabs({ tabs, activeId, onChange }: { tabs: Tab[]; activeId: string; onChange: (id: string) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-zinc-200">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 ${
              active ? "border-brand-600 text-brand-700" : "border-transparent text-zinc-500 hover:text-zinc-900"
            }`}
          >
            {tab.icon && <i className={`${tab.icon} text-base`} aria-hidden="true" />}
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <span
                className={`ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-medium ${
                  active ? "bg-brand-100 text-brand-700" : "bg-zinc-100 text-zinc-600"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
