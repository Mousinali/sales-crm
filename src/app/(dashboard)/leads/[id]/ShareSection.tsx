"use client";

import { useCallback, useEffect, useRef, useState, type UIEvent } from "react";
import Avatar from "@/components/ui/Avatar";
import { useDebouncedValue } from "@/components/ui/useDebouncedValue";
import { ROLE_LABELS } from "@/app/(dashboard)/roleDisplay";
import type { Role } from "@/lib/auth/roles";
import { parseErrorMessage } from "@/lib/parseErrorMessage";

type Share = { user_id: number; name: string; role?: Role };
type Candidate = { id: number; name: string; role: Role };

const PAGE_SIZE = 10;

// Who a lead is shared with (left) and a searchable people list to add more
// (right). The list loads 10 at a time and fetches the next 10 as you scroll,
// instead of pulling every user up front.
export default function ShareSection({ leadId, viewerId }: { leadId: number; viewerId: number }) {
  const [shares, setShares] = useState<Share[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [moreBelow, setMoreBelow] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const debouncedQuery = useDebouncedValue(query.trim(), 300);

  // Latest values for the async loaders, and a counter so a slow earlier
  // response can't overwrite a newer search.
  const sharesRef = useRef<Share[]>([]);
  const requestId = useRef(0);

  const loadCandidates = useCallback(
    async (search: string, offset: number) => {
      const id = ++requestId.current;
      setLoading(true);
      const exclude = [viewerId, ...sharesRef.current.map((s) => s.user_id)];
      const params = new URLSearchParams({ roles: "MARKETING_HEAD,PRE_SALES,SALESPERSON", exclude: exclude.join(","), limit: String(PAGE_SIZE), offset: String(offset) });
      if (search) params.set("q", search);
      try {
        const response = await fetch(`/api/users/roster?${params}`);
        if (id !== requestId.current) return;
        if (!response.ok) {
          setError(await parseErrorMessage(response, "Could not load people."));
          return;
        }
        const body = await response.json();
        setCandidates((current) => (offset === 0 ? body.users : [...current, ...body.users]));
        setHasMore(Boolean(body.hasMore));
      } catch {
        if (id === requestId.current) setError("Could not load people.");
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [viewerId],
  );

  async function loadShares(): Promise<Share[]> {
    const response = await fetch(`/api/leads/${leadId}/share`);
    const list: Share[] = response.ok ? ((await response.json()).shares ?? []) : [];
    sharesRef.current = list;
    setShares(list);
    return list;
  }

  // Shares first (so they're excluded from the list), then the first page.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadShares().catch(() => []);
      if (!cancelled) void loadCandidates(debouncedQuery, 0);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, loadCandidates]);

  // The white fade at the bottom edge shows only while there is more to scroll to.
  function updateFade(el: HTMLElement) {
    setMoreBelow(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }
  useEffect(() => {
    if (listRef.current) updateFade(listRef.current);
  }, [candidates, loading]);

  function handleScroll(event: UIEvent<HTMLUListElement>) {
    const el = event.currentTarget;
    updateFade(el);
    if (hasMore && !loading && el.scrollTop + el.clientHeight >= el.scrollHeight - 40) void loadCandidates(debouncedQuery, candidates.length);
  }

  async function change(method: "POST" | "DELETE", userId: number) {
    setError(null);
    try {
      const response = await fetch(`/api/leads/${leadId}/share`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify({ userId }) });
      if (!response.ok) {
        setError(await parseErrorMessage(response, "Could not update sharing."));
        return;
      }
      await loadShares();
      if (method === "POST") {
        // Already excluded server-side from now on, so just drop it locally and keep the scroll position.
        setCandidates((current) => current.filter((c) => c.id !== userId));
      } else {
        void loadCandidates(debouncedQuery, 0);
      }
    } catch {
      setError("Could not update sharing.");
    }
  }

  return (
    <div className="mt-6 border-t border-zinc-200 pt-4">
      <div className="grid gap-6 md:grid-cols-2">
        <section aria-label="Shared with" className="md:order-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900">
              Shared with <span className="font-normal text-zinc-500">(can view and change status)</span>
            </h3>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">{shares.length}</span>
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {shares.length === 0 && <li className="text-sm text-zinc-500">Not shared with anyone.</li>}
            {shares.map((share) => (
              <li key={share.user_id} className="flex items-center gap-3 rounded-md border border-zinc-200 px-3 py-2">
                <Avatar name={share.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-900">{share.name}</span>
                  {share.role && <span className="block text-xs text-zinc-500">{ROLE_LABELS[share.role]}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => void change("DELETE", share.user_id)}
                  aria-label={`Stop sharing with ${share.name}`}
                  title="Remove"
                  className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                >
                  <i className="ri-close-line text-lg" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Add people" className="md:order-1">
          <h3 className="text-sm font-semibold text-zinc-900">Add people</h3>
          <div className="relative mt-3">
            <i className="ri-search-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand-600" aria-hidden="true" />
            <input
              id="shareSearch"
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or role…"
              aria-label="Search people to share with"
              className="w-full rounded-md border border-zinc-300 py-2 pr-3 pl-9 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </div>
          <div className="relative mt-2">
          <ul ref={listRef} onScroll={handleScroll} className="slim-scrollbar max-h-72 divide-y divide-zinc-100 overflow-y-auto rounded-md border border-zinc-200">
            {candidates.length === 0 && !loading && <li className="px-3 py-3 text-sm text-zinc-500">No one to share with.</li>}
            {candidates.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-3 py-2 hover:bg-zinc-50">
                <Avatar name={u.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-900">{u.name}</span>
                  <span className="block text-xs text-zinc-500">{ROLE_LABELS[u.role]}</span>
                </span>
                <button type="button" onClick={() => void change("POST", u.id)} className="rounded-md bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700">
                  Share
                </button>
              </li>
            ))}
            {loading && <li className="px-3 py-2 text-center text-xs text-zinc-400">Loading…</li>}
          </ul>
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-x-px bottom-px h-14 rounded-b-md bg-gradient-to-t from-white via-white/80 to-transparent transition-opacity duration-150 ${moreBelow ? "opacity-100" : "opacity-0"}`}
          />
          </div>
        </section>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
